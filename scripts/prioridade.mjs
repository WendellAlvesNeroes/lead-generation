// Calcula a prioridade de contacto de cada lead e marca quem já está no Neroes Flow.
// Chamado pelo atualizar.mjs; a mesma fórmula está no painel (template.html).
export const ALGARVE = ["vilamoura", "almancil", "quinta do lago", "albufeira", "portimao", "lagoa", "loule", "faro", "olhao", "vale do lobo", "alvor", "algarve"];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const named = (l) => !!(l.nome && l.nome.trim() && !/^a identificar/i.test(l.nome));
const conf = (l) => l.verificacao?.estado === "confirmado";
const algarve = (l) => ALGARVE.some((c) => norm(l.cidade).includes(norm(c)));

/** Já está a ser trabalhado no Flow? Compara o nome da empresa com a lista lida do Flow. */
export function noFlow(l, flow) {
  const n = norm(l.empresa);
  if (!n) return "";
  for (const f of flow) {
    const nf = norm(f);
    if (!nf) continue;
    if (nf === n || (Math.min(nf.length, n.length) >= 5 && (nf.includes(n) || n.includes(nf)))) return f;
  }
  return "";
}

/** Pontuação de prioridade (0-105) e a razão, em palavras. */
export function prioridade(l) {
  let p = 0;
  const porque = [];
  if (named(l)) { p += 40; porque.push("nome do decisor"); }
  if (conf(l)) { p += 25; porque.push("contacto confirmado na fonte"); }
  if (l.telefone) { p += 10; porque.push("tem telefone"); }
  if (l.email) { p += 10; porque.push("tem email"); }
  if (algarve(l)) { p += 20; porque.push("Algarve (evento Vale do Lobo)"); }
  return { p, porque: porque.join(" · ") || "só dados básicos" };
}
