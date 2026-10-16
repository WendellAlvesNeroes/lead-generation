// Gera painel-artefacto.html (conteúdo sem <html>/<head>/<body>) a partir de painel-leads.html, para publicar como página privada no Claude.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const s = readFileSync(path.join(here, "painel-leads.html"), "utf8");
const style = s.match(/<style>[\s\S]*?<\/style>/)[0];
const fonts = s.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
let body = s.match(/<body>([\s\S]*)<\/body>/)[1];
// no visualizador o download direto não funciona: esconde o botão de exportar
body = body.replace('<button class="btn" id="csv" type="button">Exportar CSV</button>', '<button class="btn" id="csv" type="button" hidden>Exportar CSV</button>');
const out = `<title>Busca de Leads Neroes</title>\n${fonts}\n${style}\n${body}`;
writeFileSync(path.join(here, "painel-artefacto.html"), out);
console.log("ok", out.length, "bytes");
