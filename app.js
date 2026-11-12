"use strict";

/* ---------- Outils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const fmt = (n, dec) => (dec ? eur2 : eur0).format(n || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const monthKey = d => d.slice(0, 7);
const monthName = k => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); };
const monthShort = k => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""); };
const shiftMonth = (k, n) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const todayKey = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } }
};
async function load(path) {
  try { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw 0; return await r.json(); }
  catch { return null; }
}

/* ---------- Onglets ---------- */
const TABS = ["taches", "budget", "maison"];
function route() {
  const t = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "taches";
  TABS.forEach(k => { $("#v-" + k).hidden = k !== t; });
  document.querySelectorAll(".tabs a").forEach(a => {
    if (a.dataset.tab === t) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}
window.addEventListener("hashchange", route);

/* ---------- Photo et avatars ---------- */
/* Photo de Louise et Quentin : images/foxerie.jpg. Les avatars sont des recadrages de la même photo. */
const PHOTO = { src: "images/foxerie.jpg", cadre: "center 30%", quentin: "3% 10%", louise: "59% 13%", zoom: "520%" };
const AV_COLORS = { louise: "var(--louise)", quentin: "var(--quentin)" };
const avatar = k => `<span class="av av-${k}" style="--c:${AV_COLORS[k]}">${k === "louise" ? "L" : "Q"}</span>`;
function loadPhoto() {
  const img = new Image();
  img.onload = () => {
    const h = $("#hero-img");
    h.style.backgroundImage = `url("${PHOTO.src}")`; h.style.backgroundPosition = PHOTO.cadre;
    h.querySelector(".fox-big").hidden = true;
    document.querySelectorAll(".av").forEach(a => {
      const k = a.classList.contains("av-louise") ? "louise" : "quentin";
      a.style.backgroundImage = `url("${PHOTO.src}")`; a.style.backgroundSize = PHOTO.zoom; a.style.backgroundPosition = PHOTO[k];
      a.textContent = "";
    });
  };
  img.src = PHOTO.src;
}
function heroStats(fin, m) {
  const open = allTodos().filter(t => !t.done).length;
  const items = [`${open} tâche${open > 1 ? "s" : ""} en cours`];
  const fox = (fin && fin.comptes || []).filter(c => c.titulaire === "foxerie" && c.solde != null);
  if (fox.length) items.push(`Comptes Foxerie : ${fmt(sum(fox, c => c.solde))}`);
  const e = (m && m.etapes || []).find(x => x.statut === "en_cours");
  if (e) items.push(e.titre + " en cours");
  $("#hero-stats").innerHTML = items.map(s => `<span>${esc(s)}</span>`).join("");
}

/* ---------- Tâches ---------- */
const PEOPLE = [
  { k: "louise", n: "Louise", ph: "Ajouter pour Louise…" },
  { k: "quentin", n: "Quentin", ph: "Ajouter pour Quentin…" },
  { k: "ensemble", n: "À deux", ph: "Ajouter pour vous deux…" }
];
const TKEY = "foxerie.taches.v1";
let baseTodos = [], maisonData = null;
let local = store.get(TKEY, { ajouts: [], faits: {}, supprimes: {} });

function allTodos() {
  return [...baseTodos, ...local.ajouts]
    .filter(t => !local.supprimes[t.id])
    .map(t => ({ ...t, done: !!local.faits[t.id] }));
}
function saveLocal() { store.set(TKEY, local); renderTodos(); heroStats(fin, maisonData); }

function buildTodoCols() {
  $("#todo-cols").innerHTML = PEOPLE.map(p => `
    <div class="col col-${p.k}">
      <div class="col-head"><div class="who">${p.k === "ensemble" ? `<span class="av-duo">${avatar("louise")}${avatar("quentin")}</span>` : avatar(p.k)}<h3>${p.n}</h3></div><span class="count" id="cnt-${p.k}">0</span></div>
      <form class="add" data-who="${p.k}" autocomplete="off">
        <input id="add-${p.k}" name="t" placeholder="${p.ph}" aria-label="${p.ph}" maxlength="200">
        <button type="submit" aria-label="Ajouter">+</button>
      </form>
      <ul class="list" id="open-${p.k}"></ul>
      <details class="done-box" id="donebox-${p.k}" hidden>
        <summary id="donesum-${p.k}">Fait</summary>
        <ul class="list" id="done-${p.k}"></ul>
        <button type="button" class="link" data-clear="${p.k}">Effacer les tâches faites</button>
      </details>
    </div>`).join("");
}
function itemHtml(t) {
  return `<li class="item${t.done ? " done" : ""}">
    <input type="checkbox" id="cb-${esc(t.id)}" data-id="${esc(t.id)}"${t.done ? " checked" : ""}>
    <label class="t" for="cb-${esc(t.id)}">${esc(t.texte)}</label>
    <button type="button" class="del" data-del="${esc(t.id)}" aria-label="Supprimer « ${esc(t.texte)} »">×</button>
  </li>`;
}
function renderTodos() {
  const all = allTodos();
  PEOPLE.forEach(p => {
    const mine = all.filter(t => t.qui === p.k);
    const open = mine.filter(t => !t.done), done = mine.filter(t => t.done);
    $("#cnt-" + p.k).textContent = open.length;
    $("#open-" + p.k).innerHTML = open.map(itemHtml).join("") || `<li class="empty">Rien à faire pour l'instant.</li>`;
    $("#done-" + p.k).innerHTML = done.map(itemHtml).join("");
    $("#donesum-" + p.k).textContent = `Fait (${done.length})`;
    $("#donebox-" + p.k).hidden = !done.length;
  });
}
function wireTodos() {
  const root = $("#todo-cols");
  root.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, inp = f.elements.t, txt = inp.value.trim();
    if (!txt) return;
    local.ajouts.push({ id: "l" + Date.now().toString(36), texte: txt, qui: f.dataset.who });
    inp.value = "";
    saveLocal();
    $("#add-" + f.dataset.who).focus();
  });
  root.addEventListener("change", e => {
    const id = e.target.dataset.id; if (!id) return;
    if (e.target.checked) local.faits[id] = true; else delete local.faits[id];
    saveLocal();
  });
  root.addEventListener("click", e => {
    const del = e.target.dataset.del, clr = e.target.dataset.clear;
    if (del) { removeTodo(del); saveLocal(); }
    if (clr) { allTodos().filter(t => t.qui === clr && t.done).forEach(t => removeTodo(t.id)); saveLocal(); }
  });
}
function removeTodo(id) {
  const i = local.ajouts.findIndex(t => t.id === id);
  if (i >= 0) local.ajouts.splice(i, 1); else local.supprimes[id] = true;
  delete local.faits[id];
}

/* ---------- Budget ---------- */
/* 6 comptes : Boursorama et Société Générale × Louise, Quentin, Foxerie (joint).
   Opérations signées (négatif = débit). type "versement" = argent entre un compte perso et un compte Foxerie
   (avec "qui"), type "interne" = épargne, prêts familiaux, virements entre ses propres comptes : hors totaux. */
const SCOPES = [
  { k: "foxerie", n: "Foxerie" },
  { k: "louise", n: "Louise" },
  { k: "quentin", n: "Quentin" }
];
const HOLDERS = { louise: "Louise", quentin: "Quentin", foxerie: "Foxerie (joint)" };
const BANK_SHORT = { "Boursorama": "Bourso", "Société Générale": "SG" };
const YEAR = "annee";
let fin = null, curMonth = YEAR, minMonth = todayKey(), maxMonth = todayKey(), lastMonth = todayKey();
let scope = store.get("foxerie.scope", "foxerie");
if (!SCOPES.some(s => s.k === scope)) scope = "foxerie";

function setupBudget(data) {
  fin = data || {};
  fin.comptes = fin.comptes || [];
  fin.operations = fin.operations || [];
  const months = fin.operations.map(o => monthKey(o.date)).sort();
  if (months.length) { minMonth = months[0]; maxMonth = months[months.length - 1]; }
  lastMonth = maxMonth;
  $("#m-prev").onclick = () => { curMonth = curMonth === YEAR ? maxMonth : shiftMonth(curMonth, -1); renderBudget(); };
  $("#m-next").onclick = () => { curMonth = shiftMonth(curMonth, 1); renderBudget(); };
  $("#m-year").onclick = () => { curMonth = curMonth === YEAR ? lastMonth : YEAR; renderBudget(); };
  $("#scope").innerHTML = SCOPES.map(s => `<button type="button" data-scope="${s.k}">${s.n}</button>`).join("");
  $("#scope").addEventListener("click", e => {
    const k = e.target.dataset.scope; if (!k) return;
    scope = k; store.set("foxerie.scope", k); renderBudget();
  });
  renderBudget();
}

const bankBadge = (b, long) => `<span class="bank bank-${/Soci/.test(b) ? "sg" : "bourso"}">${esc(long ? b : (BANK_SHORT[b] || b || "?"))}</span>`;
const compte = id => fin.comptes.find(c => c.id === id) || {};
const isDepense = o => o.montant < 0 && !o.type;
const isRevenu = o => o.montant > 0 && !o.type;
const dateFr = d => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function soldesCard() {
  const banks = [...new Set(fin.comptes.map(c => c.banque))];
  const cell = c => c && c.solde != null
    ? `<td class="r ${c.solde < 0 ? "neg" : ""}" title="au ${dateFr(c.date_solde)}">${fmt(c.solde, true)}<small class="sub-d">${new Date(c.date_solde).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</small></td>`
    : `<td class="r muted">pas de relevé</td>`;
  const rows = ["foxerie", "louise", "quentin"].map(h => {
    const cs = banks.map(b => fin.comptes.find(c => c.banque === b && c.titulaire === h));
    const has = cs.filter(c => c && c.solde != null);
    return `<tr class="${h === scope ? "sel" : ""}"><td><i class="dotw w-${h}"></i>${HOLDERS[h]}</td>${cs.map(cell).join("")}<td class="r"><b>${has.length ? fmt(sum(has, c => c.solde), true) : "—"}</b></td></tr>`;
  }).join("");
  const missing = fin.comptes.filter(c => !c.releves).map(c => `${BANK_SHORT[c.banque] || c.banque} ${HOLDERS[c.titulaire].replace(" (joint)", "")}`);
  return `<div class="card">
    <h3>Soldes des 6 comptes</h3>
    <div class="scroll"><table class="tx">
      <thead><tr><th>Titulaire</th>${banks.map(b => `<th class="r">${bankBadge(b, true)}</th>`).join("")}<th class="r">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="note">Solde à la date du dernier relevé (jour/mois sous le montant).${missing.length ? ` Relevés manquants : ${missing.join(", ")}.` : ""}</p>
  </div>`;
}

function renderBudget() {
  const isYear = curMonth === YEAR;
  const year = (isYear ? maxMonth : curMonth).slice(0, 4);
  const inPeriod = o => isYear ? o.date.startsWith(year) : monthKey(o.date) === curMonth;
  document.querySelectorAll("#scope button").forEach(b => b.setAttribute("aria-pressed", b.dataset.scope === scope));
  $("#m-label").textContent = isYear ? "Année " + year : monthName(curMonth);
  $("#m-year").textContent = isYear ? "Par mois" : "Toute l'année";
  $("#m-prev").disabled = !isYear && curMonth <= minMonth;
  $("#m-next").disabled = isYear || curMonth >= maxMonth;
  $("#h-budget").textContent = scope === "foxerie" ? "Budget commun" : "Comptes de " + HOLDERS[scope];
  $("#budget-sub").textContent = scope === "foxerie"
    ? "Comptes joints Foxerie chez Boursorama et à la Société Générale. Chacun y verse selon ses moyens."
    : `Comptes personnels de ${HOLDERS[scope]} chez Boursorama et à la Société Générale.`;

  const accounts = fin.comptes.filter(c => c.titulaire === scope);
  const ids = accounts.map(c => c.id);
  const allScope = fin.operations.filter(o => ids.includes(o.compte));
  const tx = allScope.filter(inPeriod);
  const deps = tx.filter(isDepense);
  const totalDep = -sum(deps, o => o.montant);
  const per = isYear ? "sur l'année" : "ce mois";

  const vm = fin.versements_mensuels || {};
  const pl = Number(vm.louise) || 0, pq = Number(vm.quentin) || 0, prevu = pl + pq;

  if (!allScope.length) {
    $("#budget-body").innerHTML = `
      <div class="card waiting">
        <strong>Pas encore de relevés pour ${HOLDERS[scope]}</strong>
        <span class="muted">Il manque les relevés de ${accounts.map(c => esc(c.banque)).join(" et ")}. Dès qu'ils sont ajoutés, cette vue montre revenus, dépenses et versements à Foxerie.</span>
      </div>${soldesCard()}`;
    return;
  }

  let kpis, versCard = "";
  if (scope === "foxerie") {
    const vers = tx.filter(o => o.type === "versement");
    const vL = sum(vers.filter(v => v.qui === "louise"), v => v.montant);
    const vQ = sum(vers.filter(v => v.qui === "quentin"), v => v.montant);
    const aides = sum(tx.filter(isRevenu), o => o.montant);
    const entrees = vL + vQ + aides;
    const reste = entrees - totalDep;
    kpis = [
      { l: "Entrées " + per, v: fmt(entrees), d: `Versements nets et aides` },
      { l: "Dépenses communes", v: fmt(totalDep), d: `${deps.length} opération${deps.length > 1 ? "s" : ""}` },
      { l: "Solde de la période", v: fmt(reste), c: reste >= 0 ? "pos" : "neg", d: entrees > 0 ? pct.format(totalDep / entrees) + " des entrées dépensées" : "—" }
    ];
    const parts = [
      { k: "q", n: "Quentin", v: vQ, cls: "who-q" },
      { k: "l", n: "Louise", v: vL, cls: "who-l" },
      { k: "a", n: "CAF, CPAM, mutuelle", v: aides, cls: "who-a" }
    ];
    const pos = parts.filter(p => p.v > 0), tot = sum(pos, p => p.v) || 1;
    versCard = `
      <div class="card">
        <h3>Qui alimente Foxerie ${per}</h3>
        <div class="split" role="img" aria-label="Répartition des entrées">${pos.map(p => `<span class="${p.cls}" style="width:${(p.v / tot) * 100}%"></span>`).join("")}</div>
        <div class="legend">${parts.map(p => `<span><i class="${p.cls}"></i>${p.n} <b class="num ${p.v < 0 ? "neg" : ""}">${fmt(p.v)}</b>${p.v > 0 ? " · " + pct.format(p.v / tot) : ""}</span>`).join("")}</div>
        <p class="note">Versements nets : ce que chacun a versé, moins ce que Foxerie lui a reversé (indemnités, avances). Les frais avancés et remboursés par Foxerie comptent comme dépenses communes.${prevu ? ` Prévu chaque mois : Louise ${fmt(pl)}, Quentin ${fmt(pq)}.` : ""}</p>
      </div>`;
  } else {
    const rev = sum(tx.filter(isRevenu), o => o.montant);
    const verse = -sum(tx.filter(o => o.type === "versement"), o => o.montant);
    kpis = [
      { l: "Revenus " + per, v: fmt(rev), d: "Salaire et autres crédits" },
      { l: "Dépenses perso", v: fmt(totalDep), d: `${deps.length} opération${deps.length > 1 ? "s" : ""}` },
      { l: "Versé à Foxerie", v: fmt(verse), d: "Net des sommes reçues de Foxerie" }
    ];
  }

  const byCat = {};
  deps.forEach(o => { const c = o.categorie || "Divers"; byCat[c] = (byCat[c] || 0) - o.montant; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 1;

  const hist = [];
  if (isYear) { for (let k = year + "-01"; k <= maxMonth && k.startsWith(year); k = shiftMonth(k, 1)) hist.push(k); }
  else { for (let i = 5; i >= 0; i--) hist.push(shiftMonth(curMonth, -i)); }
  const hv = hist.map(k => ({ k, v: -sum(allScope.filter(o => isDepense(o) && monthKey(o.date) === k), o => o.montant) }));
  const hMax = Math.max(...hv.map(h => h.v), 1);

  const typeChip = o => {
    if (o.type === "versement") return o.qui === "louise" ? "Versement Louise" : "Versement Quentin";
    if (o.type === "interne") return o.categorie || "Interne";
    return o.categorie || "Divers";
  };
  const shown = isYear ? deps.slice().sort((a, b) => a.montant - b.montant).slice(0, 40) : tx.slice().sort((a, b) => b.date.localeCompare(a.date));

  $("#budget-body").innerHTML = `
    <div class="kpis">${kpis.map(k => `
      <div class="card kpi"><div class="label">${k.l}</div><div class="v ${k.c || ""}">${k.v}</div><div class="d">${k.d}</div></div>`).join("")}
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Dépenses par catégorie</h3>
        <div class="bars">${cats.map(([c, v]) => `
          <div class="bar-row"><span>${esc(c)}</span><div class="bar"><span style="width:${(v / maxCat) * 100}%"></span></div><b class="num">${fmt(v)}</b></div>`).join("") || `<p class="empty">Aucune dépense ${per}.</p>`}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <h3>${isYear ? "Dépenses mois par mois" : "Dépenses sur six mois"}</h3>
          <div class="hist" role="img" aria-label="Dépenses par mois">
            ${hv.map(h => `<div class="m${h.k === curMonth ? " cur" : ""}" title="${monthName(h.k)} : ${fmt(h.v)}">
              <div class="col-b" style="height:${Math.max(2, (h.v / hMax) * 100)}%"></div></div>`).join("")}
          </div>
          <div class="hist-lab">${hv.map(h => `<small>${monthShort(h.k)}</small>`).join("")}</div>
          <p class="note">Plus haut : ${fmt(hMax)} en ${monthName(hv.reduce((a, b) => b.v > a.v ? b : a).k)}.</p>
        </div>
        ${versCard}
      </div>
    </div>
    ${soldesCard()}
    <div class="card">
      <h3>${isYear ? "Les 40 plus grosses dépenses de l'année" : "Opérations du mois"}</h3>
      <div class="scroll">
        <table class="tx">
          <thead><tr><th>Date</th><th>Libellé</th><th>Compte</th><th>Catégorie</th><th class="r">Montant</th></tr></thead>
          <tbody>${shown.map(o => `
            <tr class="${o.type === "interne" ? "muted" : ""}"><td class="num">${new Date(o.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</td>
            <td>${esc(o.libelle)}</td>
            <td>${bankBadge(compte(o.compte).banque)}</td>
            <td><span class="chip">${esc(typeChip(o))}</span></td>
            <td class="r ${o.montant > 0 ? "pos" : ""}">${o.montant > 0 ? "+" : "−"}${fmt(Math.abs(o.montant), true)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Aucune opération ${per}.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${isYear ? "" : `<p class="note">En gris : épargne, prêts familiaux et virements entre vos propres comptes, hors totaux.</p>`}
    </div>`;
}

/* ---------- Maison ---------- */
const PIE_C = { louise: "var(--louise)", quentin: "var(--quentin)", pret: "var(--pret)", foxerie: "var(--accent)" };
/* Camembert (anneau) en SVG : chaque part est un arc de cercle de circonférence 100. */
function pie(items, centre, small) {
  items = items.filter(x => x.v > 0);
  const tot = sum(items, x => x.v) || 1;
  let acc = 0;
  const arcs = items.map(x => {
    const p = x.v / tot * 100, off = 25 - acc; acc += p;
    return `<circle r="15.915" cx="21" cy="21" fill="none" stroke="${x.c}" stroke-width="7" stroke-dasharray="${Math.max(0, p - 0.4).toFixed(3)} ${(100 - Math.max(0, p - 0.4)).toFixed(3)}" stroke-dashoffset="${off.toFixed(3)}"><title>${esc(x.l)} : ${fmt(x.v)} (${pct.format(x.v / tot)})</title></circle>`;
  }).join("");
  return `<div class="pie${small ? " small" : ""}">
    <svg viewBox="0 0 42 42" role="img" aria-label="${esc(centre)} : ${items.map(x => esc(x.l) + " " + pct.format(x.v / tot)).join(", ")}">
      <circle r="15.915" cx="21" cy="21" fill="none" stroke="var(--line)" stroke-width="7"/>${arcs}
      <text x="21" y="20" text-anchor="middle" class="pie-l">${esc(centre)}</text>
      <text x="21" y="25" text-anchor="middle" class="pie-v">${fmt(tot).replace(/\s?€/, "")} €</text>
    </svg>
    <ul class="pie-leg">${items.map(x => `<li><i style="background:${x.c}"></i><span>${esc(x.l)}</span><b class="num">${fmt(x.v)}</b><small>${pct.format(x.v / tot)}</small></li>`).join("")}</ul>
  </div>`;
}
const STATUT = { fait: "Fait", en_cours: "En cours", a_faire: "À venir" };

function renderMaison(m) {
  if (!m) { $("#maison-body").innerHTML = `<p class="empty">Impossible de lire <code>data/maison.json</code>.</p>`; return; }
  if (m.adresse) $("#addr").textContent = m.adresse.replace(", ", " · ");

  const R = m.ressources || [], D = m.depenses || [];
  const totR = sum(R, r => r.montant), totD = sum(D, d => d.montant);
  const apports = R.filter(r => r.qui !== "pret"), apport = sum(apports, r => r.montant);
  const pret = m.pret || {};
  const prix = (D.find(d => /acquisition/i.test(d.libelle)) || {}).montant || 0;
  const notaire = (D.find(d => /notaire/i.test(d.libelle)) || {}).montant || 0;
  const travauxBudget = (D.find(d => /travaux/i.test(d.libelle)) || {}).montant || 0;
  const suivi = m.suivi || [], ec = m.ec_renov || {};
  const paye = {}, parType = {};
  suivi.forEach(s => { paye[s.qui] = (paye[s.qui] || 0) + s.montant; parType[s.type] = (parType[s.type] || 0) + s.montant; });
  const ecPaye = ec.paye ? ec.paye.especes + ec.paye.factures : 0;
  const ecPrevu = ec.prevu ? ec.prevu.especes + ec.prevu.factures : 0;
  const ecFinance = parType["EC Renov"] || 0;
  const achats = parType["Travaux"] || 0;
  const travauxFaits = ecPaye + achats;
  const TYPE_LAB = { "EC Renov": "EC Rénov (fonds)", "Travaux": "Achats travaux", "Achat maison": "Achat maison", "Consommables": "Consommables" };
  const QUI_LAB = { louise: "Louise", quentin: "Quentin", foxerie: "Foxerie" };
  const sansTravaux = totD - travauxBudget;
  const cls = { louise: "who-l", quentin: "who-q", pret: "who-p" };
  const ecart = Math.round((totR - totD) * 100) / 100;

  let mensualite = null;
  if (pret.taux != null && pret.duree_annees) {
    const r = pret.taux / 100 / 12, n = pret.duree_annees * 12, P = pret.montant || 0;
    mensualite = r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
  }

  const etapes = m.etapes || [];
  const nbFait = etapes.filter(e => e.statut === "fait").length;

  $("#maison-sub").textContent = `Plan de financement de l'achat · ${nbFait} étape${nbFait > 1 ? "s" : ""} sur ${etapes.length} franchie${nbFait > 1 ? "s" : ""}.`;

  $("#maison-body").innerHTML = `
    <div class="kpis">
      <div class="card kpi"><div class="label">Coût total du projet</div><div class="v">${fmt(totD)}</div><div class="d">${fmt(sansTravaux)} sans les travaux</div></div>
      <div class="card kpi"><div class="label">Apport personnel</div><div class="v">${fmt(apport)}</div><div class="d">${pct.format(apport / totR)} du financement</div></div>
      <div class="card kpi"><div class="label">Prêt ${esc(pret.banque || "")}</div><div class="v">${fmt(pret.montant)}</div><div class="d">${pct.format((pret.montant || 0) / totR)} du financement · ${pct.format((pret.montant || 0) / (prix || 1))} du prix</div></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>D'où vient l'argent</h3>
        ${pie(R.map(r => ({ l: r.libelle, v: r.montant, c: PIE_C[r.qui] || "var(--pret)" })), "Ressources")}
      </div>
      <div class="card">
        <h3>Où va l'argent</h3>
        ${pie(D.map((d, i) => ({ l: d.libelle, v: d.montant, c: /travaux/i.test(d.libelle) ? "var(--p6)" : `var(--p${i + 1})` })), "Emplois")}
        <p class="note">Frais de notaire : ${pct.format(notaire / (prix || 1))} du prix d'achat. ${Math.abs(ecart) >= 1 ? `Écart ressources − emplois : ${fmt(ecart, true)}.` : "Ressources et emplois sont équilibrés."}</p>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Avancement</h3>
        <ol class="steps">${etapes.map((e, i) => `
          <li class="st-${esc(e.statut)}">
            <span class="dot">${e.statut === "fait" ? "✓" : i + 1}</span>
            <div><div class="ttl">${esc(e.titre)}</div>${e.date ? `<div class="dt">${new Date(e.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>` : ""}${e.note ? `<div class="dt">${esc(e.note)}</div>` : ""}</div>
            <span class="pill ${esc(e.statut)}">${STATUT[e.statut] || esc(e.statut)}</span>
          </li>`).join("")}
        </ol>
      </div>
      <div class="stack">
        <div class="card">
          <h3>Apports : prévu et payé</h3>
          ${pie(Object.entries(paye).map(([k, v]) => ({ l: "Payé par " + (QUI_LAB[k] || k), v, c: PIE_C[k] })), "Payé", true)}
          ${suivi.length ? `<table class="tx">
            <thead><tr><th></th><th class="r">Apport prévu</th><th class="r">Payé</th><th class="r">Écart</th></tr></thead>
            <tbody>${apports.map(a => { const p = paye[a.qui] || 0, e = p - a.montant; return `<tr><td><i class="dotw w-${a.qui}"></i>${esc(a.libelle.replace(/^Apport /, ""))}</td><td class="r">${fmt(a.montant)}</td><td class="r">${fmt(p)}</td><td class="r ${e > 0 ? "neg" : "pos"}">${e > 0 ? "+" : "−"}${fmt(Math.abs(e))}</td></tr>`; }).join("")}
            ${paye.foxerie ? `<tr><td><i class="dotw w-foxerie"></i>Foxerie</td><td class="r muted">—</td><td class="r">${fmt(paye.foxerie)}</td><td></td></tr>` : ""}</tbody>
          </table>
          <p class="note">Payé : total des lignes du suivi des dépenses (achat, travaux, EC Rénov). Un écart positif veut dire que la personne a déjà mis plus que son apport.</p>`
          : `<div class="legend">${apports.map(a => `<span><i class="${cls[a.qui]}"></i>${esc(a.libelle.replace(/^Apport /, ""))} <b class="num">${fmt(a.montant)}</b> · ${pct.format(a.montant / apport)}</span>`).join("")}</div>`}
        </div>
        <div class="card">
          <h3>Prêt immobilier</h3>
          <dl class="kv">
            <dt>Banque</dt><dd>${esc(pret.banque || "—")}</dd>
            <dt>Emprunteur</dt><dd>${esc(pret.emprunteur || "—")}</dd>
            <dt>Capital</dt><dd>${fmt(pret.montant)}</dd>
            <dt>Taux</dt><dd>${pret.taux != null ? String(pret.taux).replace(".", ",") + " %" : `<span class="muted">à compléter</span>`}</dd>
            <dt>Durée</dt><dd>${pret.duree_annees ? pret.duree_annees + " ans" : `<span class="muted">à compléter</span>`}${pret.fin ? ` · fin le ${new Date(pret.fin).toLocaleDateString("fr-FR")}` : ""}</dd>
            ${mensualite ? `<dt>Mensualité (hors assurance)</dt><dd>${fmt(mensualite, true)}</dd>` : ""}
            ${pret.mensualite_actuelle ? `<dt>Mensualité aujourd'hui</dt><dd><b>${fmt(pret.mensualite_actuelle, true)}</b></dd>` : ""}
            ${pret.mensualite_future ? `<dt>Mensualité plus tard</dt><dd>environ ${fmt(pret.mensualite_future)}</dd>` : ""}
            ${pret.prelevement ? `<dt>Prélevée sur</dt><dd>${esc(pret.prelevement)}</dd>` : ""}
            ${(pret.echeances_observees || []).map(x => `<dt>Prélevé le ${new Date(x.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</dt><dd>${fmt(x.montant, true)}</dd>`).join("")}
            ${pret.assurance_mensuelle ? `<dt>Assurance</dt><dd>${fmt(pret.assurance_mensuelle, true)} / mois</dd>` : ""}
          </dl>
        </div>
        <div class="card">
          <h3>Budget travaux</h3>
          <div class="row-lab" style="display:flex;justify-content:space-between"><span>${fmt(travauxFaits)} dépensés</span><b class="num">sur ${fmt(travauxBudget)}</b></div>
          <div class="progress${travauxFaits > travauxBudget ? " over" : ""}"><span style="width:${Math.min(100, (travauxFaits / (travauxBudget || 1)) * 100)}%"></span></div>
          <dl class="kv">
            <dt>EC Rénov payé (espèces + factures)</dt><dd>${fmt(ecPaye, true)}</dd>
            <dt>EC Rénov prévu</dt><dd>${fmt(ecPrevu, true)}</dd>
            <dt>Achats et équipement</dt><dd>${fmt(achats, true)}</dd>
            <dt>${travauxFaits > travauxBudget ? "Dépassement" : "Reste"}</dt><dd class="${travauxFaits > travauxBudget ? "neg" : "pos"}">${fmt(Math.abs(travauxBudget - travauxFaits), true)}</dd>
          </dl>
          ${ec.note ? `<p class="note">${esc(ec.note)}. Mis de côté pour EC Rénov : ${fmt(ecFinance)}, soit ${fmt(ecFinance - ecPaye)} pas encore dépensés.</p>` : ""}
          ${(ec.factures || []).length ? `<table class="tx" style="margin-top:8px"><thead><tr><th>Facture EC Rénov</th><th class="r">Montant</th></tr></thead><tbody>${ec.factures.map(f => `<tr><td>${esc(f.ref)}<small class="sub-d">${esc(f.note || "")}</small></td><td class="r">${fmt(f.montant, true)}</td></tr>`).join("")}</tbody></table>` : ""}
        </div>
      </div>
    </div>
    ${suivi.length ? `<div class="card">
      <h3>Suivi des dépenses de la maison</h3>
      <div class="pie-wrap-row">${pie(Object.entries(parType).map(([t, v], i) => ({ l: TYPE_LAB[t] || t, v, c: `var(--p${[1, 6, 3, 4][i] || 5})` })), "Total")}</div>
      <div class="scroll"><table class="tx">
        <thead><tr><th>Date</th><th>Dépense</th><th>Type</th><th>Payé par</th><th class="r">Montant</th></tr></thead>
        <tbody>${suivi.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(s => `
          <tr><td class="num">${s.date ? new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—"}</td>
          <td>${esc(s.libelle)}${s.fait ? "" : ` <span class="pill a_faire">à payer</span>`}</td>
          <td><span class="chip">${esc(TYPE_LAB[s.type] || s.type)}</span></td>
          <td><i class="dotw w-${s.qui}"></i>${esc(QUI_LAB[s.qui] || s.qui)}</td>
          <td class="r">${fmt(s.montant, true)}</td></tr>`).join("")}
        </tbody>
      </table></div>
      <p class="note">Repris du tableur « Suivi dépenses ». Les lignes EC Rénov sont l'argent mis de côté pour payer l'entreprise (virements vers le compte SG, espèces).</p>
    </div>` : ""}`;
}

/* ---------- Démarrage ---------- */
(async function init() {
  route();
  buildTodoCols();
  wireTodos();
  renderTodos();
  loadPhoto();
  const [t, f, m] = await Promise.all([load("data/taches.json"), load("data/finances.json"), load("data/maison.json")]);
  baseTodos = (t && t.taches) || [];
  maisonData = m;
  renderTodos();
  setupBudget(f);
  renderMaison(m);
  heroStats(fin, m);
})();
