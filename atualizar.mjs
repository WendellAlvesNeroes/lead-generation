// Atualiza o painel de leads SEM API e SEM servidor.
//   1) lê os ficheiros novos de entrada/ (TSV, CSV ou JSON) vindos das pesquisas feitas no Claude (plano);
//   2) junta-os a dados/leads.json sem repetidos (empresa, email, telefone);
//   3) opcional --verificar: reabre as páginas citadas e confirma email/telefone/nome (só HTTP, sem IA);
//   4) gera painel-leads.html (uma página, abre com duplo clique).
// Uso: node atualizar.mjs [--verificar]
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DADOS = path.join(here, "dados", "leads.json");
const ENTRADA = path.join(here, "entrada");
const VERIFICAR = process.argv.includes("--verificar");
const ESTADOS = ["Por Contactar", "Contactado", "Em Conversa", "Reunião Marcada", "Sem Interesse"];

/* ---------- duplicados (mesma lógica da plataforma) ---------- */
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
const digits = (s) => { const d = String(s ?? "").replace(/\D+/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };
function findDup(d, pool) {
  const ne = norm(d.empresa), nm = norm(d.email), dp = digits(d.telefone);
  for (const l of pool) {
    const nl = norm(l.empresa);
    if (ne && nl && (nl === ne || (Math.min(nl.length, ne.length) >= 5 && (nl.includes(ne) || ne.includes(nl))))) return `empresa (${l.empresa})`;
    if (nm && norm(l.email) === nm) return `email (${l.empresa})`;
    if (dp && digits(l.telefone) === dp) return `telefone (${l.empresa})`;
  }
  return "";
}

/* ---------- leitura de ficheiros de entrada ---------- */
const s0 = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
function parseFile(file) {
  const raw = readFileSync(file, "utf8").replace(/^﻿/, "").trim();
  if (/^[\[{`]/.test(raw)) {
    const j = raw.replace(/^`{3}(?:json)?\s*/i, "").replace(/`{3}\s*$/, "");
    let a = JSON.parse(j);
    if (!Array.isArray(a)) a = [a];
    return a.map((x) => ({ nome: s0(x.nome), cargo: s0(x.cargo), empresa: s0(x.empresa), segmento: s0(x.segmento), telefone: s0(x.telefone), email: s0(x.email), cidade: s0(x.cidade), estado: ESTADOS.includes(s0(x.estado)) ? s0(x.estado) : "Por Contactar", fonte: s0(x.fonte) }));
  }
  return raw.split(/\r?\n/).filter((l) => l.trim() && !/^NOTA:/i.test(l)).map((l) => {
    const c = (l.includes("\t") ? l.split("\t") : l.split(";")).map((x) => x.trim());
    return c.length < 8 || /^nome$/i.test(c[0]) ? null : { nome: c[0], cargo: c[1], empresa: c[2], segmento: c[3], telefone: c[4], email: c[5], cidade: c[7], estado: ESTADOS.includes(c[9]) ? c[9] : "Por Contactar", fonte: c[10] || "" };
  }).filter((r) => r && r.empresa);
}

/* ---------- verificação das fontes (HTTP simples, sem IA) ---------- */
function isPrivate(ip) {
  if (ip.includes(":")) { const v = ip.toLowerCase(); return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80"); }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
async function publicUrl(raw) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("protocolo");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) throw new Error("host");
  if (isIP(h) ? isPrivate(h) : (await lookup(h, { all: true })).some((a) => isPrivate(a.address))) throw new Error("privado");
  return u;
}
function decodeCf(hex) { const k = parseInt(hex.slice(0, 2), 16); let o = ""; for (let i = 2; i < hex.length; i += 2) o += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); return o; }
const toText = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/[a-z]+>/gi, (_m, x) => " " + decodeCf(x) + " ")
  .replace(/mailto:([^"'?>\s]+)/gi, " $1 ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#64;|&commat;/g, "@").replace(/\s+/g, " ");
async function pageText(url) {
  const u = await publicUrl(url);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(u, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "NeroesPainel/0.1 (verificacao de contactos publicados)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    await publicUrl(r.url);
    return toText(new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(await r.arrayBuffer()).subarray(0, 1_500_000)));
  } finally { clearTimeout(t); }
}
async function verificar(l) {
  const urls = [...new Set(String(l.fonte).split(/[;\s]+/).filter((u) => /^https?:\/\//i.test(u)))].slice(0, 3);
  const pages = [];
  for (const u of urls) { try { pages.push(await pageText(u)); } catch { /* inacessível */ } }
  if (!pages.length) return { estado: "sem_acesso", data: new Date().toISOString() };
  const all = pages.join(" "), low = all.toLowerCase(), dig = all.replace(/\D/g, ""), nn = norm(all);
  const em = l.email.toLowerCase(), td = digits(l.telefone);
  const v = {
    email: em ? low.includes(em) : null,
    telefone: td ? dig.includes(td) : null,
    nome: l.nome && !/^a identificar/i.test(l.nome) ? nn.includes(norm(l.nome)) : null,
    data: new Date().toISOString(),
  };
  v.estado = v.email === true || v.telefone === true ? "confirmado" : "nao_confirmado";
  return v;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const x = items[i++]; await fn(x); } })); }

/* ---------- principal ---------- */
mkdirSync(path.dirname(DADOS), { recursive: true });
const db = existsSync(DADOS) ? JSON.parse(readFileSync(DADOS, "utf8")) : { leads: [], rondas: [], ficheiros: [] };
const files = readdirSync(ENTRADA).filter((f) => /\.(tsv|csv|json|txt)$/i.test(f) && !db.ficheiros.includes(f)).sort();
for (const f of files) {
  const rows = parseFile(path.join(ENTRADA, f));
  const ronda = f.replace(/\.[^.]+$/, "");
  const data = statSync(path.join(ENTRADA, f)).mtime.toISOString();
  let novos = 0, repetidos = 0;
  for (const r of rows) {
    if (findDup(r, db.leads)) { repetidos++; continue; }
    db.leads.push({ ...r, id: db.leads.length + 1, ronda, verificacao: null });
    novos++;
  }
  db.rondas.push({ id: ronda, data, lidos: rows.length, novos, repetidos });
  db.ficheiros.push(f);
  console.log(`${f}: ${rows.length} linhas, ${novos} novos, ${repetidos} repetidos`);
}
if (!files.length) console.log("Sem ficheiros novos em entrada/.");

if (VERIFICAR) {
  const todo = db.leads.filter((l) => !l.verificacao);
  console.log(`A verificar ${todo.length} leads nas páginas de origem (só HTTP)…`);
  await pool(todo, 4, async (l) => { l.verificacao = await verificar(l); });
  const c = db.leads.reduce((a, l) => { const e = l.verificacao?.estado; a[e] = (a[e] || 0) + 1; return a; }, {});
  console.log("Resultado:", JSON.stringify(c));
}

db.atualizado = new Date().toISOString();
writeFileSync(DADOS, JSON.stringify(db, null, 1));
const tpl = readFileSync(path.join(here, "template.html"), "utf8");
const logo = readFileSync(path.join(here, "assets", "logo.png")).toString("base64");
const json = JSON.stringify({ leads: db.leads, rondas: db.rondas, atualizado: db.atualizado }).replace(/</g, "\\u003c");
writeFileSync(path.join(here, "painel-leads.html"), tpl.replace("__LOGO__", () => "data:image/png;base64," + logo).replace("/*__DATA__*/null", () => json));
console.log(`Painel atualizado: ${db.leads.length} leads → painel-leads.html`);
