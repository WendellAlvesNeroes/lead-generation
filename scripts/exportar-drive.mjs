// Gera "leads-plataforma.xlsx" com TODOS os leads do painel, nas 10 colunas da base da equipa,
// para o projeto Claude (que lê o Drive) e para quem abrir no Excel.
// Uso: node scripts/exportar-drive.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(readFileSync(path.join(here, "dados", "leads.json"), "utf8"));

const HEAD = ["Nome", "Cargo", "Empresa", "Segmento", "Telefone", "Email", "LinkedIn", "Cidade", "Responsável", "Estado", "Data", "Verificação", "Fonte"];
const W = [30, 34, 38, 18, 16, 32, 20, 22, 14, 16, 12, 22, 54];
const RESP = ["André", "Duarte", "Wendell"];
const named = (l) => !!(l.nome && l.nome.trim() && !/^a identificar/i.test(l.nome));
const vtxt = (l) => (!l.verificacao ? "não verificado" : l.verificacao.estado === "confirmado" ? "confirmado na fonte" : l.verificacao.estado === "sem_acesso" ? "fonte inacessível" : "não encontrado na fonte");

const wb = new ExcelJS.Workbook();
wb.creator = "Busca de Leads Neroes";
const ws = wb.addWorksheet("Leads plataforma");
ws.columns = HEAD.map((h, i) => ({ header: h, key: h, width: W[i] }));
const head = ws.getRow(1);
head.font = { bold: true, color: { argb: "FFFFFFFF" } };
head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A0A0A" } };
ws.views = [{ state: "frozen", ySplit: 1 }];
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEAD.length } };

const leads = [...db.leads].sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || a.empresa.localeCompare(b.empresa, "pt"));
leads.forEach((l, i) => {
  ws.addRow([
    named(l) ? l.nome : l.nome || "A identificar",
    l.cargo || "", l.empresa, l.segmento || "", l.telefone || "", l.email || "", l.linkedin || "", l.cidade || "",
    l.responsavel || RESP[i % 3], l.estado || "Por Contactar", l.data || "", vtxt(l), l.fonte || "",
  ]);
});

const notas = wb.addWorksheet("Notas");
notas.columns = [{ width: 120 }];
const nConf = db.leads.filter((l) => l.verificacao?.estado === "confirmado").length;
const nNamed = db.leads.filter(named).length;
[
  "ORIGEM: plataforma Busca de Leads Neroes (painel-leads.html). Gerado em " + new Date().toLocaleString("pt-PT") + ".",
  `CONTEÚDO: ${db.leads.length} leads · ${nNamed} com nome de decisor · ${nConf} confirmados na página de origem.`,
  'VERIFICAÇÃO: "confirmado na fonte" = o email ou telefone voltou a aparecer na página oficial indicada na coluna Fonte, numa verificação automática por HTTP. "não encontrado" = rever à mão. "fonte inacessível" = a página não abriu ao verificador.',
  "MÉTODO: pesquisa feita no Claude (plano da equipa, sem API) em sites oficiais das entidades. Nenhum contacto é inventado: campo vazio = não publicado no site.",
  "DUPLICADOS: bloqueados por empresa, email e telefone antes de entrar no painel.",
  "RGPD: contactos com nome de pessoa só devem ser usados com base legal e com opção de recusa. A maioria dos contactos é institucional (secretaria, geral, imprensa) e não é o contacto direto do decisor.",
  "ATUALIZAR: pôr os ficheiros novos em painel\\entrada e executar atualizar-painel.bat; depois correr node scripts/exportar-drive.mjs e substituir este ficheiro no Drive.",
].forEach((t) => notas.addRow([t]));
notas.getColumn(1).alignment = { wrapText: true, vertical: "top" };

const out = path.join(here, "leads-plataforma.xlsx");
await wb.xlsx.writeFile(out);
console.log(`ok: ${leads.length} leads → ${out}`);
