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

/* ---------- Tâches ---------- */
const PEOPLE = [
  { k: "louise", n: "Louise", ph: "Ajouter pour Louise…" },
  { k: "quentin", n: "Quentin", ph: "Ajouter pour Quentin…" },
  { k: "ensemble", n: "À deux", ph: "Ajouter pour vous deux…" }
];
const TKEY = "foxerie.taches.v1";
let baseTodos = [];
let local = store.get(TKEY, { ajouts: [], faits: {}, supprimes: {} });

function allTodos() {
  return [...baseTodos, ...local.ajouts]
    .filter(t => !local.supprimes[t.id])
    .map(t => ({ ...t, done: !!local.faits[t.id] }));
}
function saveLocal() { store.set(TKEY, local); renderTodos(); }

function buildTodoCols() {
  $("#todo-cols").innerHTML = PEOPLE.map(p => `
    <div class="col col-${p.k}">
      <div class="col-head"><h3>${p.n}</h3><span class="count" id="cnt-${p.k}">0</span></div>
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
let fin = null, curMonth = todayKey(), minMonth = todayKey(), maxMonth = todayKey();

function setupBudget(data) {
  fin = data || { versements_mensuels: {}, depenses: [] };
  const months = (fin.depenses || []).map(d => monthKey(d.date)).sort();
  if (months.length) {
    minMonth = months[0];
    maxMonth = months[months.length - 1] > todayKey() ? months[months.length - 1] : todayKey();
    curMonth = months[months.length - 1];
  }
  $("#m-prev").onclick = () => { curMonth = shiftMonth(curMonth, -1); renderBudget(); };
  $("#m-next").onclick = () => { curMonth = shiftMonth(curMonth, 1); renderBudget(); };
  renderBudget();
}

function renderBudget() {
  $("#m-label").textContent = monthName(curMonth);
  $("#m-prev").disabled = curMonth <= minMonth;
  $("#m-next").disabled = curMonth >= maxMonth;

  const vm = fin.versements_mensuels || {};
  const pl = Number(vm.louise) || 0, pq = Number(vm.quentin) || 0, prevu = pl + pq;
  const tx = (fin.depenses || []).filter(d => monthKey(d.date) === curMonth);
  const deps = tx.filter(d => d.type !== "versement");
  const vers = tx.filter(d => d.type === "versement");
  const totalDep = sum(deps, d => d.montant);
  const recuL = sum(vers.filter(v => v.qui === "louise"), v => v.montant);
  const recuQ = sum(vers.filter(v => v.qui === "quentin"), v => v.montant);
  const entrees = vers.length ? recuL + recuQ : prevu;
  const reste = entrees - totalDep;
  const hasData = (fin.depenses || []).length > 0;

  const shareL = prevu ? pl / prevu : 0, shareQ = prevu ? pq / prevu : 0;
  const versCard = `
    <div class="card">
      <h3>Qui verse quoi</h3>
      ${prevu ? `
        <div class="split" role="img" aria-label="Louise ${pct.format(shareL)}, Quentin ${pct.format(shareQ)}">
          <span class="who-l" style="width:${shareL * 100}%"></span><span class="who-q" style="width:${shareQ * 100}%"></span>
        </div>
        <div class="legend">
          <span><i class="who-l"></i>Louise <b class="num">${fmt(pl)}</b> · ${pct.format(shareL)}</span>
          <span><i class="who-q"></i>Quentin <b class="num">${fmt(pq)}</b> · ${pct.format(shareQ)}</span>
        </div>
        ${vers.length ? `<p class="note">Reçu ce mois : Louise ${fmt(recuL)} · Quentin ${fmt(recuQ)}</p>` : ""}`
      : `<p class="empty">Montants mensuels à renseigner dans <code>data/finances.json</code> (Louise : xxx €, Quentin : xxx €).</p>`}
    </div>`;

  if (!hasData) {
    $("#budget-body").innerHTML = `
      <div class="card waiting">
        <strong>En attente des relevés bancaires</strong>
        <span class="muted">Dès que les données du compte commun sont ajoutées, ce tableau montre les dépenses du mois, la répartition par catégorie et ce qui reste.</span>
      </div>
      ${versCard}`;
    return;
  }

  // Catégories
  const byCat = {};
  deps.forEach(d => { const c = d.categorie || "Autre"; byCat[c] = (byCat[c] || 0) + Number(d.montant || 0); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 1;

  // Historique 6 mois
  const hist = [];
  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(curMonth, -i);
    hist.push({ k, v: sum((fin.depenses || []).filter(d => d.type !== "versement" && monthKey(d.date) === k), d => d.montant) });
  }
  const hMax = Math.max(prevu, ...hist.map(h => h.v), 1);

  $("#budget-body").innerHTML = `
    <div class="kpis">
      <div class="card kpi"><div class="label">${vers.length ? "Versé ce mois" : "Versements prévus"}</div><div class="v">${fmt(entrees)}</div><div class="d">Louise + Quentin</div></div>
      <div class="card kpi"><div class="label">Dépenses du mois</div><div class="v">${fmt(totalDep)}</div><div class="d">${deps.length} opération${deps.length > 1 ? "s" : ""}</div></div>
      <div class="card kpi"><div class="label">Reste</div><div class="v ${reste >= 0 ? "pos" : "neg"}">${fmt(reste)}</div><div class="d">${entrees ? pct.format(Math.max(0, totalDep) / entrees) + " du budget utilisé" : "—"}</div></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Par catégorie</h3>
        <div class="bars">${cats.map(([c, v]) => `
          <div class="bar-row"><span>${esc(c)}</span><div class="bar"><span style="width:${(v / maxCat) * 100}%"></span></div><b class="num">${fmt(v)}</b></div>`).join("") || `<p class="empty">Aucune dépense ce mois-ci.</p>`}
        </div>
      </div>
      <div class="card">
        <h3>Six derniers mois</h3>
        <div class="hist" role="img" aria-label="Dépenses des six derniers mois">
          ${prevu ? `<div class="ref" style="bottom:${(prevu / hMax) * 100}%" title="Versements prévus ${fmt(prevu)}"></div>` : ""}
          ${hist.map(h => `<div class="m${h.k === curMonth ? " cur" : ""}" title="${monthName(h.k)} : ${fmt(h.v)}">
            <div class="col-b" style="height:${Math.max(2, (h.v / hMax) * 100)}%"></div></div>`).join("")}
        </div>
        <div class="hist-lab">${hist.map(h => `<small>${monthShort(h.k)}</small>`).join("")}</div>
        ${prevu ? `<p class="note">Pointillés : versements prévus (${fmt(prevu)}).</p>` : ""}
      </div>
    </div>
    ${versCard}
    <div class="card">
      <h3>Opérations du mois</h3>
      <div class="scroll">
        <table class="tx">
          <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th class="r">Montant</th></tr></thead>
          <tbody>${tx.sort((a, b) => b.date.localeCompare(a.date)).map(d => `
            <tr><td class="num">${new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</td>
            <td>${esc(d.libelle)}</td>
            <td><span class="chip">${esc(d.type === "versement" ? "Versement " + (d.qui === "louise" ? "Louise" : "Quentin") : d.categorie || "Autre")}</span></td>
            <td class="r ${d.type === "versement" ? "pos" : ""}">${d.type === "versement" ? "+" : "−"}${fmt(Math.abs(d.montant), true)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Aucune opération ce mois-ci.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ---------- Maison ---------- */
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
  const travauxFaits = sum(m.travaux || [], t => t.montant);
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

    <div class="card">
      <h3>Ressources et emplois</h3>
      <div class="stack">
        <div>
          <div class="row-lab"><span class="label">Ressources</span><b class="num">${fmt(totR)}</b></div>
          <div class="bigbar">${R.map(r => `<span class="${cls[r.qui] || "who-p"}" style="width:${(r.montant / totR) * 100}%" title="${esc(r.libelle)} : ${fmt(r.montant)}">${r.montant / totR > .1 ? esc(r.libelle.replace(/^Apport /, "")) : ""}</span>`).join("")}</div>
        </div>
        <div>
          <div class="row-lab"><span class="label">Emplois</span><b class="num">${fmt(totD)}</b></div>
          <div class="bigbar">${D.map((d, i) => `<span class="${/travaux/i.test(d.libelle) ? "e5" : "e" + Math.min(i, 4)}" style="width:${(d.montant / totD) * 100}%" title="${esc(d.libelle)} : ${fmt(d.montant)}">${d.montant / totD > .1 ? esc(d.libelle) : ""}</span>`).join("")}</div>
        </div>
      </div>
      <div class="grid2" style="margin-top:16px">
        <div class="scroll"><table class="tx">
          <thead><tr><th>Ressource</th><th class="r">Montant</th><th class="r">Part</th></tr></thead>
          <tbody>${R.map(r => `<tr><td><i class="${cls[r.qui] || "who-p"}" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px"></i>${esc(r.libelle)}</td><td class="r">${fmt(r.montant, true)}</td><td class="r">${pct.format(r.montant / totR)}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="scroll"><table class="tx">
          <thead><tr><th>Emploi</th><th class="r">Montant</th><th class="r">Part</th></tr></thead>
          <tbody>${D.map(d => `<tr><td>${esc(d.libelle)}</td><td class="r">${fmt(d.montant)}</td><td class="r">${pct.format(d.montant / totD)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>
      <p class="note">Frais de notaire : ${pct.format(notaire / (prix || 1))} du prix d'achat. ${Math.abs(ecart) >= 1 ? `Écart ressources − emplois : ${fmt(ecart, true)}.` : "Ressources et emplois sont équilibrés."}</p>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Avancement</h3>
        <ol class="steps">${etapes.map((e, i) => `
          <li class="st-${esc(e.statut)}">
            <span class="dot">${e.statut === "fait" ? "✓" : i + 1}</span>
            <div><div class="ttl">${esc(e.titre)}</div>${e.date ? `<div class="dt">${new Date(e.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>` : ""}</div>
            <span class="pill ${esc(e.statut)}">${STATUT[e.statut] || esc(e.statut)}</span>
          </li>`).join("")}
        </ol>
      </div>
      <div class="stack">
        <div class="card">
          <h3>Apports</h3>
          <div class="split" role="img" aria-label="Répartition des apports">
            ${apports.map(a => `<span class="${cls[a.qui]}" style="width:${(a.montant / apport) * 100}%"></span>`).join("")}
          </div>
          <div class="legend">${apports.map(a => `<span><i class="${cls[a.qui]}"></i>${esc(a.libelle.replace(/^Apport /, ""))} <b class="num">${fmt(a.montant)}</b> · ${pct.format(a.montant / apport)}</span>`).join("")}</div>
        </div>
        <div class="card">
          <h3>Prêt immobilier</h3>
          <dl class="kv">
            <dt>Banque</dt><dd>${esc(pret.banque || "—")}</dd>
            <dt>Emprunteur</dt><dd>${esc(pret.emprunteur || "—")}</dd>
            <dt>Capital</dt><dd>${fmt(pret.montant)}</dd>
            <dt>Taux</dt><dd>${pret.taux != null ? String(pret.taux).replace(".", ",") + " %" : `<span class="muted">à compléter</span>`}</dd>
            <dt>Durée</dt><dd>${pret.duree_annees ? pret.duree_annees + " ans" : `<span class="muted">à compléter</span>`}</dd>
            <dt>Mensualité (hors assurance)</dt><dd>${mensualite ? fmt(mensualite, true) : `<span class="muted">—</span>`}</dd>
            ${pret.assurance_mensuelle ? `<dt>Assurance</dt><dd>${fmt(pret.assurance_mensuelle, true)} / mois</dd>` : ""}
          </dl>
        </div>
        <div class="card">
          <h3>Budget travaux</h3>
          <div class="row-lab" style="display:flex;justify-content:space-between"><span>${fmt(travauxFaits)} dépensés</span><b class="num">${fmt(travauxBudget)}</b></div>
          <div class="progress"><span style="width:${Math.min(100, (travauxFaits / (travauxBudget || 1)) * 100)}%"></span></div>
          ${(m.travaux || []).length
            ? `<table class="tx"><tbody>${m.travaux.map(t => `<tr><td>${esc(t.libelle)}</td><td class="r">${fmt(t.montant)}</td></tr>`).join("")}</tbody></table>`
            : `<p class="note">Aucune facture de travaux pour l'instant. Reste ${fmt(travauxBudget - travauxFaits)}.</p>`}
        </div>
      </div>
    </div>`;
}

/* ---------- Démarrage ---------- */
(async function init() {
  route();
  buildTodoCols();
  wireTodos();
  renderTodos();
  const [t, f, m] = await Promise.all([load("data/taches.json"), load("data/finances.json"), load("data/maison.json")]);
  baseTodos = (t && t.taches) || [];
  renderTodos();
  setupBudget(f);
  renderMaison(m);
})();
