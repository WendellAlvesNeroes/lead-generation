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

/** Lê um .xlsx com as colunas da base da equipa (Nome, Cargo, Empresa, Segmento, Telefone, Email, LinkedIn, Cidade, Responsável, Estado). */
async function parseXlsx(file) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const txt = (row, c) => String(row.getCell(c).text ?? "").trim();
  // descobre a coluna de cada campo pelo cabeçalho; se não houver, usa a ordem da base da equipa
  const head = {};
  ws.getRow(1).eachCell((cell, c) => { head[norm(cell.text)] = c; });
  const col = (nome, fallback) => head[norm(nome)] ?? fallback;
  const C = { nome: col("Nome", 1), cargo: col("Cargo", 2), empresa: col("Empresa", 3), segmento: col("Segmento", 4), telefone: col("Telefone", 5), email: col("Email", 6), linkedin: col("LinkedIn", 7), cidade: col("Cidade", 8), responsavel: col("Responsável", 9), estado: col("Estado", 10), fonte: col("Fonte", 0) };
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const empresa = txt(row, C.empresa);
    if (!empresa || norm(empresa) === "empresa") return;
    const estado = txt(row, C.estado);
    out.push({
      nome: txt(row, C.nome), cargo: txt(row, C.cargo), empresa, segmento: txt(row, C.segmento),
      telefone: txt(row, C.telefone), email: txt(row, C.email), cidade: txt(row, C.cidade),
      estado: ESTADOS.includes(estado) ? estado : "Por Contactar",
      fonte: C.fonte ? txt(row, C.fonte) : path.basename(file),
    });
  });
  return out;
}

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
const files = readdirSync(ENTRADA).filter((f) => /\.(tsv|csv|json|txt|xlsx)$/i.test(f) && !/^~\$/.test(f) && !db.ficheiros.includes(f)).sort();
for (const f of files) {
  const rows = /.xlsx$/i.test(f) ? await parseXlsx(path.join(ENTRADA, f)) : parseFile(path.join(ENTRADA, f));
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
// ---- datas, meta semanal e pré-renderização (o painel mostra tudo mesmo sem JavaScript) ----
const META = 50;
const dateOf = (id) => (String(id).match(/^\d{4}-\d{2}-\d{2}/) || [""])[0];
for (const l of db.leads) if (!l.data) l.data = dateOf(l.ronda) || (db.rondas.find((r) => r.id === l.ronda)?.data || "").slice(0, 10);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const now = new Date();
const TODAY = ymd(now);
const mon = new Date(now); mon.setHours(12); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
const MON = ymd(mon);
const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");
const dow = (s) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(s + "T12:00:00").getDay()];

const exclFile = path.join(here, "dados", "exclusoes-base.txt");
const exclusoes = existsSync(exclFile) ? readFileSync(exclFile, "utf8").replace(/\([^)]*\)/g, "").split(/[;\n]/).map((x) => x.trim()).filter(Boolean) : [];
const json = JSON.stringify({ leads: db.leads, rondas: db.rondas, atualizado: db.atualizado, exclusoes, meta: META }).replace(/</g, "\\u003c");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const named = (l) => !!(l.nome && l.nome.trim() && !/^a identificar/i.test(l.nome));
const score = (l) => (named(l) ? 2 : 0) + (l.email ? 1 : 0) + (l.telefone ? 1 : 0);
const conf = (l) => l.verificacao?.estado === "confirmado";
const prio = (l) => score(l) * 10 + (conf(l) ? 5 : 0);
const inWeek = (l) => !!l.data && l.data >= MON && l.data <= TODAY;
const nL = db.leads.length, nNamed = db.leads.filter(named).length, nConf = db.leads.filter(conf).length, nRan = db.leads.filter((l) => l.verificacao).length;
const wk = db.leads.filter(inWeek).length;
const kp = (v, t) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(t)}</span></div>`;
const kpis = kp(nL, "leads na base") + kp(db.leads.filter((l) => l.data === TODAY).length, "novos hoje") + kp(nL ? Math.round((nNamed / nL) * 100) + "%" : "0%", "com nome de decisor") + kp(nRan ? `${nConf} de ${nRan}` : "—", "confirmados na fonte");

const days = {};
for (const l of db.leads) if (l.data && l.data >= MON) days[l.data] = (days[l.data] || 0) + 1;
const falta = Math.max(0, META - wk);
const metaHtml = `<div class="top"><span class="big">${wk} <small>de ${META} leads esta semana</small></span><span style="color:var(--muted)">${falta ? "faltam " + falta : "meta cumprida ✔"}</span></div><div class="prog"><i style="width:${Math.min(100, Math.round((wk / META) * 100))}%"></i></div><div style="margin:8px 0"><a class="btn main big-btn" href="#tab-find">Buscar novos leads</a></div><div class="days">${Object.keys(days).sort().reverse().map((d) => `<span class="day"><b>+${days[d]}</b> ${dow(d)} ${ddmm(d)}${d === TODAY ? " (hoje)" : ""}</span>`).join("") || '<span style="color:var(--muted);font-size:13px">Ainda não entrou nenhum lead esta semana.</span>'}</div>`;

const q = (l) => (score(l) >= 4 ? ["Alta", "alta"] : score(l) >= 2 ? ["Média", "media"] : ["Baixa", "baixa"]);
const rowsHtml = [...db.leads].sort((a, b) => prio(b) - prio(a) || a.empresa.localeCompare(b.empresa, "pt")).map((l) => {
  const [ql, qc] = q(l);
  const v = !l.verificacao ? "não verificado" : l.verificacao.estado === "confirmado" ? "✔ confirmado na fonte" : l.verificacao.estado === "sem_acesso" ? "fonte inacessível" : "✖ não encontrado na fonte";
  return `<tr><td><b>${ddmm(l.data)}</b></td><td><b>${esc(l.empresa)}</b><small>${esc(l.cidade)} · ${esc(l.segmento)}</small></td><td>${named(l) ? esc(l.nome) : "A identificar"}<small>${esc(l.cargo)}</small></td><td>${esc(l.telefone) || "—"}</td><td>${esc(l.email) || "—"}</td><td><span class="pill ${qc}">${ql}</span></td><td>${v}</td></tr>`;
}).join("");
const tableHtml = `<table><thead><tr><th>Data</th><th>Empresa</th><th>Contacto</th><th>Telefone</th><th>Email</th><th>Qualidade</th><th>Verificação</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;

// pedidos por segmento (versão estática; o JavaScript volta a gerá-los com as opções escolhidas)
const names = [...new Set([...db.leads.map((l) => l.empresa), ...exclusoes].filter(Boolean))];
// lista atualizada de entidades a excluir (usada pela tarefa semanal e por qualquer pesquisa)
writeFileSync(path.join(here, "dados", "exclusoes.txt"), "JÁ NA BASE (não repetir nenhuma destas entidades):\n" + names.join("; ") + "\n");
const brief = (seg, n) => `Pesquisa na web e encontra ${n} leads B2B NOVOS do segmento "${seg}" em Portugal para a Neroes (treino mental com EEG para clubes e atletas, escolas, ginásios, clínicas e empresas).\n\nREGRAS:\n- Só dados escritos num site oficial da própria entidade (contactos, direção, órgãos sociais, relatório e contas). Nunca inventes nem deduzas emails, telefones ou nomes. Campo desconhecido = "".\n- PRIORIDADE ao nome e cargo de um responsável de decisão publicado no site; pelo menos 7 em cada 10 com nome. Sem nome, usa o contacto institucional e deixa o nome vazio.\n- Escolhe páginas em que o email/telefone aparece no HTML estático: um verificador vai reabrir a página da fonte e procurar o contacto.\n- Não uses LinkedIn nem adivinhes emails no formato nome.apelido@. Cada lead com email OU telefone. Diversifica por cidades e regiões.\n- NÃO repitas nenhuma destas entidades (já na base, ${names.length}): ${names.join("; ")}.\n\nFORMATO: responde APENAS com um array JSON válido (sem texto antes ou depois, sem blocos de código): [{"nome":"","cargo":"","empresa":"","segmento":"${seg}","telefone":"","email":"","cidade":"","fonte":"URL1 ; URL2"}]. Se não encontrares ${n} verificados, devolve menos. Não inventes.`;
const briefsHtml = ["Desporto", "Educação Privada", "Fitness", "Corporate", "Clínicas e Saúde"].map((s, i) => `<div class="panel"><b>Pedido ${i + 1} · ${s} · 10 leads</b><pre class="brief" tabindex="0">${esc(brief(s, 10))}</pre></div>`).join("");

const upd = `Atualizado em ${now.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}`;
const tpl = readFileSync(path.join(here, "template.html"), "utf8");
const logo = readFileSync(path.join(here, "assets", "logo.png")).toString("base64");
writeFileSync(
  path.join(here, "painel-leads.html"),
  tpl.replace("__LOGO__", () => "data:image/png;base64," + logo).replace("/*__DATA__*/null", () => json).replace("__UPD__", () => upd).replace("__META__", () => metaHtml).replace("__KPIS__", () => kpis).replace("__TABLE__", () => tableHtml).replace("__BRIEFS__", () => briefsHtml),
);
db.atualizado = now.toISOString();
writeFileSync(DADOS, JSON.stringify(db, null, 1));
console.log(`Painel atualizado: ${db.leads.length} leads (${wk} esta semana, meta ${META}) → painel-leads.html`);
