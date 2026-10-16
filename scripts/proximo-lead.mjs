// Gera "proximo-lead.html": página mínima que mostra UM lead de cada vez — o próximo a ligar.
// Para o Neroes Flow: um link, sem despejar leads lá dentro. O estado é partilhado pela equipa.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(readFileSync(path.join(here, "dados", "leads.json"), "utf8"));
const logo = readFileSync(path.join(here, "assets", "logo.png")).toString("base64");

const named = (l) => !!(l.nome && l.nome.trim() && !/^a identificar/i.test(l.nome));
const fila = db.leads
  .filter((l) => !l.flow && (l.estado || "Por Contactar") === "Por Contactar" && (l.telefone || l.email))
  .sort((a, b) => (b.prioridade ?? 0) - (a.prioridade ?? 0) || a.empresa.localeCompare(b.empresa, "pt"))
  .slice(0, 60)
  .map((l) => ({
    id: l.id, empresa: l.empresa, nome: named(l) ? l.nome : "", cargo: l.cargo || "", segmento: l.segmento || "",
    cidade: l.cidade || "", telefone: l.telefone || "", email: l.email || "", porque: l.porque || "",
    fonte: String(l.fonte || "").split(/[;\s]+/).find((u) => /^https?:\/\//.test(u)) || "",
    confirmado: l.verificacao?.estado === "confirmado",
  }));

const data = JSON.stringify({ fila, gerado: new Date().toISOString(), total: db.leads.length }).replace(/</g, "\\u003c");

const html = `<title>Próximo Lead Neroes</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;500;700&display=swap">
<style>
/* Layout: um cartão, um lead. Tudo o resto sai da frente. Tokens Neroes: preto, acento azul vivo. */
:root{color-scheme:dark;--bg:#0A0A0A;--tint:#141416;--ink:#F2F1ED;--muted:#A09F99;--line:#2A2A2E;--brand:#00A5E9;--ok:#5CCB93;--ok-s:#10261B;--warn:#E4B054;--font:"Roboto Condensed","Arial Narrow",Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.4 var(--font);padding:0 18px 36px;font-variant-numeric:tabular-nums}
.wrap{max-width:640px;margin:0 auto}
header{display:flex;align-items:center;gap:12px;padding:18px 0 12px;border-bottom:1px solid var(--line);margin-bottom:18px}
header img{height:30px}h1{margin:0;font-size:17px;text-transform:uppercase;letter-spacing:.03em}h1 span{color:var(--brand)}
.pos{margin-left:auto;color:var(--muted);font-size:13px}
.card{background:var(--tint);border:1px solid var(--line);border-radius:14px;padding:20px}
.seg{display:inline-block;background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:2px 11px;font-size:13px;color:var(--muted)}
h2{margin:10px 0 2px;font-size:27px;line-height:1.15}
.pessoa{font-size:17px;margin-bottom:2px}.cargo,.cidade{color:var(--muted);font-size:14.5px}
.porque{color:var(--brand);font-size:14px;margin:12px 0 16px}
.linha{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.val{font-size:21px;font-weight:700;letter-spacing:.01em;word-break:break-all}
.val.sm{font-size:16px;font-weight:500}
.lbl{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em;min-width:74px}
button,a.btn{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px 14px;cursor:pointer;min-height:42px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
button:hover,a.btn:hover{border-color:var(--brand)}
.main{background:var(--ink);color:#0A0A0A;border-color:var(--ink);font-weight:600}
.cpb{min-height:32px;padding:3px 10px;font-size:13px;color:var(--muted)}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.acoes .main{flex:1 1 230px}
.feitos{margin-top:18px;color:var(--muted);font-size:13.5px}
.feitos b{color:var(--ok)}
.vazio{text-align:center;padding:40px 10px;color:var(--muted)}
.nota{color:var(--muted);font-size:12.5px;margin-top:16px;line-height:1.45}
a{color:var(--brand)}
#toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--ink);color:#0A0A0A;padding:8px 16px;border-radius:7px;font-size:14px}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.ok{color:var(--ok)}
</style>
<div class="wrap">
<header>
  <img src="data:image/png;base64,${logo}" alt="Neroes">
  <h1>Próximo <span>lead</span></h1>
  <span class="pos" id="pos"></span>
</header>
<main id="main"><div class="card"><div class="vazio">A carregar…</div></div></main>
<p class="nota" id="nota"></p>
</div>
<div id="toast" hidden></div>
<script>
(function(){
"use strict";
var D=${data};
var $=function(s){return document.querySelector(s)};
function h(t,p){var e=document.createElement(t);if(p)Object.keys(p).forEach(function(k){var v=p[k];if(k==="class")e.className=v;else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),v);else if(v===true)e.setAttribute(k,"");else if(v!==false&&v!=null)e.setAttribute(k,v)});for(var i=2;i<arguments.length;i++)[].concat(arguments[i]).forEach(function(c){if(c==null||c===false)return;e.append(c&&c.nodeType?c:document.createTextNode(String(c)))});return e}
function toast(m){var t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){t.hidden=true},2600)}
function copy(txt,msg){function fb(){var a=h("textarea",{style:"position:fixed;opacity:0"});a.value=txt;document.body.append(a);a.select();try{document.execCommand("copy");toast(msg)}catch(e){toast("Selecione e copie")}a.remove()}
 try{navigator.clipboard.writeText(txt).then(function(){toast(msg)},fb)}catch(e){fb()}}

var feitos={},db=null,modo="local";
var LS="neroes-proximo-lead";
function lerLocal(){try{return JSON.parse(localStorage.getItem(LS)||"{}")}catch(e){return {}}}
function guardarLocal(){try{localStorage.setItem(LS,JSON.stringify(feitos))}catch(e){}}

function proximo(){for(var i=0;i<D.fila.length;i++){if(!feitos[D.fila[i].id])return {l:D.fila[i],i:i}}return null}

function registar(l,estado){
  feitos[l.id]={estado:estado,quando:new Date().toISOString()};
  guardarLocal();
  if(db){db.doc("contactados/"+l.id).set({empresa:l.empresa,estado:estado,quando:new Date().toISOString()}).catch(function(){})}
  render();
}

function render(){
  var p=proximo(),box=$("#main");
  var nf=Object.keys(feitos).length;
  $("#pos").textContent=p?(p.i+1)+" de "+D.fila.length:"fila terminada";
  if(!p){
    box.replaceChildren(h("div",{class:"card"},h("div",{class:"vazio"},h("div",{style:"font-size:19px;color:var(--ink);margin-bottom:6px"},"Fila terminada ✔"),"Já passaram todos os "+D.fila.length+" leads desta fila. Volte amanhã ou peça uma ronda nova na plataforma de leads.")));
  } else {
    var l=p.l;
    var det=h("div",null,
      h("span",{class:"seg"},l.segmento||"—"),
      h("h2",null,l.empresa),
      h("div",{class:"pessoa"},l.nome||h("span",{style:"color:var(--muted)"},"A identificar — peça para falar com a direção")),
      l.cargo?h("div",{class:"cargo"},l.cargo):null,
      l.cidade?h("div",{class:"cidade"},l.cidade):null,
      h("div",{class:"porque"},l.porque||""),
      l.telefone?h("div",{class:"linha"},h("span",{class:"lbl"},"Telefone"),h("span",{class:"val"},l.telefone),h("button",{class:"cpb",type:"button",onclick:function(){copy(l.telefone,"Telefone copiado")}},"copiar")):null,
      l.email?h("div",{class:"linha"},h("span",{class:"lbl"},"Email"),h("span",{class:"val sm"},l.email),h("button",{class:"cpb",type:"button",onclick:function(){copy(l.email,"Email copiado")}},"copiar")):null,
      h("div",{class:"linha"},h("span",{class:"lbl"},"Fonte"),l.fonte?h("a",{href:l.fonte,target:"_blank",rel:"noopener noreferrer"},"página oficial"):h("span",{style:"color:var(--muted)"},"base da equipa"),l.confirmado?h("span",{class:"ok"},"· contacto confirmado"):null),
      h("div",{class:"acoes"},
        h("button",{class:"main",type:"button",onclick:function(){registar(l,"contactado")}},"Contactei → próximo"),
        h("button",{type:"button",onclick:function(){registar(l,"saltado")}},"Saltar"),
        h("button",{type:"button",onclick:function(){copy([l.empresa,l.nome,l.cargo,l.telefone,l.email,l.cidade].filter(Boolean).join(" · "),"Contacto copiado")}},"Copiar tudo")));
    box.replaceChildren(h("div",{class:"card"},det));
  }
  $("#nota").replaceChildren(
    h("div",{class:"feitos"},"Nesta fila: ",h("b",null,nf)," marcados · ",String(D.fila.length-nf)," por contactar"),
    h("div",null,"Fila ordenada por prioridade: nome do decisor, contacto confirmado na página oficial, telefone, email e proximidade do evento. Os leads ficam na plataforma de leads; aqui só aparece o próximo. Gerado em "+new Date(D.gerado).toLocaleString("pt-PT",{dateStyle:"short",timeStyle:"short"})+" a partir de "+D.total+" leads."),
    h("div",{style:"margin-top:6px"},modo==="db"?"Estado partilhado com a equipa.":"Estado guardado só neste navegador."));
}

feitos=lerLocal();
render();
if(window.claude&&window.claude.use){
  window.claude.use("db").then(function(x){
    if(!x)return;db=x;modo="db";
    db.collection("contactados").onSnapshot(function(snap){
      var m={};snap.docs.forEach(function(d){var v=d.data()||{};m[d.id]={estado:v.estado,quando:v.quando}});
      Object.keys(feitos).forEach(function(k){if(!m[k])m[k]=feitos[k]});
      feitos=m;guardarLocal();render();
    },function(){});
  }).catch(function(){});
}
})();
</script>`;

writeFileSync(path.join(here, "proximo-lead.html"), html);
console.log(`ok: fila de ${fila.length} · topo: ${fila[0]?.empresa} (${fila[0]?.telefone || fila[0]?.email}) → proximo-lead.html`);
