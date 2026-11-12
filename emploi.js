"use strict";
/* ---------- Veille emploi ----------
   Offres ReliefWeb (API officielle, il faut un « appname » approuvé, à mettre dans data/profil.json)
   et offres collées à la main. Chaque offre est notée selon data/profil.json, et l'outil prépare
   un brouillon de lettre à relire. Rien n'est envoyé : c'est Quentin qui postule. */
const EKEY = "foxerie.emploi.v1";
const ECACHE = "foxerie.emploi.cache.v1";
let profil = null;
let estate = store.get(EKEY, { statuts: {}, collees: [], scoreMin: null, filtre: "a_voir" });
let offresRW = [], rwInfo = { etat: "attente", msg: "" };
const THEMES = {
  digital: { fr: "transformation numérique", en: "digital transformation" },
  ai: { fr: "IA", en: "AI" },
  product: { fr: "gestion de produit", en: "product management" },
  it: { fr: "systèmes d'information", en: "information systems" },
  data: { fr: "données et information management", en: "data and information management" },
  lowcode: { fr: "low-code et Power Platform", en: "low-code and Power Platform" },
  management: { fr: "management d'équipe", en: "team leadership" },
  fintech: { fr: "fintech et transferts monétaires", en: "fintech and cash transfers" },
  strategy: { fr: "stratégie et innovation", en: "strategy and innovation" },
  climate: { fr: "climat et environnement", en: "climate and environment" }
};
const STATUTS = { interesse: "Intéressé", postule: "Candidature envoyée", ecarte: "Écartée" };
const saveE = () => store.set(EKEY, estate);

function noterOffre(o) {
  const titre = " " + o.titre.toLowerCase() + " ";
  const tout = " " + (o.titre + " " + o.texte).toLowerCase() + " ";
  if (profil.exclure.some(x => titre.includes(x.toLowerCase()))) return { score: 0, themes: [], exclue: true };
  let brut = 0; const themes = [];
  for (const [cat, { poids, termes }] of Object.entries(profil.mots_cles)) {
    if (termes.some(t => titre.includes(t.toLowerCase()))) { brut += poids * 2; themes.push(cat); }
    else if (termes.some(t => tout.includes(t.toLowerCase()))) { brut += poids; themes.push(cat); }
  }
  const metier = themes.some(c => ["digital", "ai", "product", "it", "data", "lowcode", "fintech"].includes(c));
  const lieu = Object.entries(profil.lieux).reduce((m, [k, v]) => (o.pays + " " + o.texte).toLowerCase().includes(k.toLowerCase()) ? Math.max(m, v) : m, 0);
  brut += lieu;
  if (/national (contract|staff|position)|nationals only|only nationals/i.test(o.texte) && !/france/i.test(o.pays)) brut -= 8;
  return { score: metier ? Math.max(0, Math.min(100, Math.round(brut / 38 * 100))) : Math.min(15, brut), themes };
}
const langueDe = t => ((t.match(/\b(le|la|les|des|et|pour|avec|vous|nous|poste)\b/gi) || []).length > (t.match(/\b(the|and|for|with|you|we|position|role|will)\b/gi) || []).length ? "fr" : "en");
const md2txt = s => String(s || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[#*_>`|-]+/g, " ").replace(/\s+/g, " ").trim();

async function chercherRW(force) {
  const app = (profil.reliefweb_appname || "").trim();
  if (!app) { rwInfo = { etat: "sans_appname" }; return; }
  if (!force) {
    const c = store.get(ECACHE, null);
    if (c && Date.now() - c.t < 6 * 3600e3) { offresRW = c.offres; rwInfo = { etat: "ok", t: c.t }; return; }
  }
  rwInfo = { etat: "chargement" }; renderEmploi();
  const p = new URLSearchParams();
  p.set("appname", app);
  p.set("query[value]", profil.recherches.join(" OR "));
  p.set("query[operator]", "OR");
  p.set("filter[field]", "date.closing");
  p.set("filter[value][from]", new Date().toISOString().slice(0, 10) + "T00:00:00+00:00");
  ["title", "url_alias", "source.name", "country.name", "city.name", "date.closing", "date.created", "body"].forEach(f => p.append("fields[include][]", f));
  p.append("sort[]", "date.created:desc");
  p.set("limit", "200");
  try {
    const r = await fetch("https://api.reliefweb.int/v2/jobs?" + p.toString());
    const j = await r.json();
    if (!r.ok) throw new Error(j && j.error ? j.error.message : "HTTP " + r.status);
    offresRW = (j.data || []).map(d => {
      const f = d.fields || {};
      return {
        id: "rw" + d.id, source: "ReliefWeb",
        titre: f.title || "", organisation: (f.source || []).map(s => s.name).join(", "),
        pays: [...(f.city || []).map(c => c.name), ...(f.country || []).map(c => c.name)].join(", "),
        lien: f.url_alias || ("https://reliefweb.int/job/" + d.id),
        publie: (f.date && f.date.created || "").slice(0, 10), cloture: (f.date && f.date.closing || "").slice(0, 10) || null,
        texte: md2txt(f.body).slice(0, 6000)
      };
    });
    store.set(ECACHE, { t: Date.now(), offres: offresRW });
    rwInfo = { etat: "ok", t: Date.now() };
  } catch (e) {
    rwInfo = { etat: "erreur", msg: e.message };
  }
}

function toutesOffres() {
  return [...offresRW, ...estate.collees].map(o => {
    const n = noterOffre(o);
    return { ...o, ...n, langue: o.langue || langueDe(o.texte), statut: estate.statuts[o.id] || null };
  });
}

function experiencesPour(themes) {
  const map = { digital: ["digital"], ai: ["ai"], product: ["product"], it: ["it", "digital"], data: ["data"], lowcode: ["lowcode", "automation"], management: ["management"], fintech: ["fintech", "cash"], strategy: ["strategy"], climate: ["climate", "environment"] };
  const voulus = new Set(themes.flatMap(t => map[t] || []));
  const notes = profil.experiences.map(e => ({ e, n: e.tags.filter(t => voulus.has(t)).length }));
  const choix = [profil.experiences[0]];
  notes.filter(x => x.e !== profil.experiences[0]).sort((a, b) => b.n - a.n).slice(0, 2).forEach(x => { if (x.n > 0) choix.push(x.e); });
  return choix;
}

function lettre(o, lang) {
  const exps = experiencesPour(o.themes);
  const th = o.themes.filter(t => t !== "management").slice(0, 3).map(t => THEMES[t][lang]);
  const listeTh = th.length > 1 ? th.slice(0, -1).join(", ") + (lang === "fr" ? " et " : " and ") + th[th.length - 1] : th[0] || (lang === "fr" ? "le numérique" : "digital");
  const org = o.organisation || (lang === "fr" ? "votre organisation" : "your organisation");
  const remote = /remote|home.?based|télétravail/i.test(o.pays || "");
  const lieu = !o.pays ? "" : remote ? (lang === "fr" ? ", en télétravail" : ", remote") : (lang === "fr" ? `, basé à ${o.pays}` : `, based in ${o.pays}`);
  if (lang === "fr") return [
    "Madame, Monsieur,",
    `Je vous adresse ma candidature au poste de ${o.titre} chez ${org}${lieu}.`,
    profil.accroche_fr,
    ...exps.map(e => e.fr),
    `Ce poste, centré sur ${listeTh}, rejoint directement ce que je fais au quotidien : partir des besoins des équipes, livrer vite des outils simples, et mesurer ce qu'ils changent pour les personnes que nous servons.`,
    `Je serais heureux d'échanger avec vous sur la manière dont je peux contribuer aux missions de ${org}.`,
    "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
    profil.nom
  ].join("\n\n");
  return [
    "Dear Hiring Manager,",
    `I am writing to apply for the ${o.titre} position at ${org}${lieu}.`,
    profil.accroche_en,
    ...exps.map(e => e.en),
    `This role, centred on ${listeTh}, matches what I do every day: start from what teams need, ship simple tools quickly, and measure what they change for the people we serve.`,
    `I would welcome the chance to discuss how I can contribute to ${org}'s work.`,
    "Kind regards,",
    profil.nom
  ].join("\n\n");
}

function pointsForts(o) {
  return experiencesPour(o.themes).map(e => `<li><b>${esc(e.poste)}</b> · ${esc(e.structure)} <span class="muted">(${esc(e.periode)})</span></li>`).join("")
    + (o.themes.length ? `<li>Thèmes communs : ${o.themes.map(t => esc(THEMES[t].fr)).join(", ")}</li>` : "");
}

function joursRestants(d) {
  if (!d) return "";
  const n = Math.ceil((new Date(d) - new Date(new Date().toISOString().slice(0, 10))) / 864e5);
  return n < 0 ? "clôturée" : n === 0 ? "clôture aujourd'hui" : `clôture dans ${n} j`;
}

function carteOffre(o) {
  const cls = o.score >= 60 ? "fort" : o.score >= 40 ? "moyen" : "faible";
  return `<article class="offre${o.statut ? " st-" + o.statut : ""}" data-id="${esc(o.id)}">
    <div class="offre-score ${cls}" title="Correspondance avec ton profil"><b>${o.score}</b><small>/100</small></div>
    <div class="offre-main">
      <h3>${o.lien ? `<a href="${esc(o.lien)}" target="_blank" rel="noopener">${esc(o.titre)}</a>` : esc(o.titre)}</h3>
      <div class="offre-meta">${[o.organisation, o.pays].filter(Boolean).map(esc).join(" · ")}${o.cloture ? ` · <span class="${/dans [0-6] j|aujourd/.test(joursRestants(o.cloture)) ? "neg" : ""}">${joursRestants(o.cloture)}</span>` : ""} · <span class="chip">${esc(o.source)}</span>${o.statut ? ` <span class="pill ${o.statut}">${STATUTS[o.statut]}</span>` : ""}</div>
      <div class="offre-themes">${o.themes.map(t => `<span class="chip">${esc(THEMES[t].fr)}</span>`).join("")}</div>
      <div class="offre-actions">
        <button type="button" class="btn primary" data-act="brouillon">Préparer la candidature</button>
        <button type="button" class="btn" data-act="interesse">Intéressé</button>
        <button type="button" class="btn" data-act="postule">Candidature envoyée</button>
        <button type="button" class="btn ghost" data-act="ecarte">Écarter</button>
        ${o.source === "Collée" ? `<button type="button" class="btn ghost" data-act="supprimer">Supprimer</button>` : ""}
      </div>
      <div class="brouillon" id="br-${esc(o.id)}" hidden></div>
    </div>
  </article>`;
}

function renderEmploi() {
  const host = $("#emploi-body"); if (!host || !profil) return;
  const min = estate.scoreMin ?? profil.score_min;
  const all = toutesOffres();
  const filtre = estate.filtre;
  const list = all.filter(o => !o.exclue && o.score >= min)
    .filter(o => filtre === "toutes" ? true : filtre === "a_voir" ? o.statut !== "ecarte" : o.statut === filtre)
    .sort((a, b) => b.score - a.score || (b.publie || "").localeCompare(a.publie || ""));
  const etat = {
    attente: "", chargement: `<p class="note">Recherche en cours sur ReliefWeb…</p>`,
    ok: `<p class="note">ReliefWeb : ${offresRW.length} offres ouvertes lues${rwInfo.t ? ", mises à jour à " + new Date(rwInfo.t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}.</p>`,
    erreur: `<p class="note neg">ReliefWeb ne répond pas : ${esc(rwInfo.msg)}</p>`,
    sans_appname: ""
  }[rwInfo.etat] || "";

  host.innerHTML = `
    ${rwInfo.etat === "sans_appname" ? `<div class="card waiting">
      <strong>Il manque l'accès à ReliefWeb</strong>
      <span class="muted">ReliefWeb (la principale source d'offres humanitaires) demande un nom d'application approuvé pour son API, gratuit. Demande-le sur la page « appname » de la documentation : <a href="https://apidoc.reliefweb.int/parameters#appname" target="_blank" rel="noopener">apidoc.reliefweb.int</a> (par exemple « foxerie-veille »). Une fois approuvé, mets-le dans <code>data/profil.json</code> (champ <code>reliefweb_appname</code>) ou donne-le à Claude. En attendant, tu peux coller des offres ci-dessous.</span>
    </div>` : ""}
    <div class="card emploi-bar">
      <div class="seg" role="group" aria-label="Filtrer">${[["a_voir", "À voir"], ["interesse", "Intéressé"], ["postule", "Envoyées"], ["ecarte", "Écartées"], ["toutes", "Toutes"]].map(([k, n]) => `<button type="button" data-filtre="${k}" aria-pressed="${filtre === k}">${n}</button>`).join("")}</div>
      <label class="range"><span>Score minimum <b id="smin-v">${min}</b></span><input type="range" id="smin" min="0" max="90" step="5" value="${min}"></label>
      <button type="button" class="btn" id="rw-refresh"${profil.reliefweb_appname ? "" : " disabled"}>Relancer la recherche</button>
    </div>
    ${etat}
    <div class="offres">${list.map(carteOffre).join("") || `<p class="empty">Aucune offre au-dessus de ${min}/100 dans ce filtre.</p>`}</div>
    <details class="card coller" id="coller-box">
      <summary><b>Coller une offre</b> <span class="muted">(LinkedIn, site d'une ONG, newsletter…)</span></summary>
      <form id="coller-form" autocomplete="off">
        <div class="row2">
          <input id="c-titre" required placeholder="Intitulé du poste" aria-label="Intitulé du poste">
          <input id="c-org" placeholder="Organisation" aria-label="Organisation">
          <input id="c-lieu" placeholder="Lieu" aria-label="Lieu">
          <input id="c-lien" placeholder="Lien (facultatif)" aria-label="Lien de l'offre">
        </div>
        <textarea id="c-texte" rows="6" required placeholder="Colle ici le texte de l'offre" aria-label="Texte de l'offre"></textarea>
        <button type="submit" class="btn primary">Analyser l'offre</button>
      </form>
    </details>`;
}

function wireEmploi() {
  const host = $("#emploi-body");
  host.addEventListener("click", async e => {
    const f = e.target.dataset.filtre;
    if (f) { estate.filtre = f; saveE(); renderEmploi(); return; }
    if (e.target.id === "rw-refresh") { await chercherRW(true); renderEmploi(); return; }
    const act = e.target.dataset.act; if (!act) return;
    const card = e.target.closest(".offre"), id = card.dataset.id;
    const o = toutesOffres().find(x => x.id === id);
    if (act === "brouillon") {
      const box = card.querySelector(".brouillon");
      if (!box.hidden) { box.hidden = true; return; }
      box.innerHTML = brouillonHtml(o, o.langue); box.hidden = false; return;
    }
    if (act === "lang") { const box = card.querySelector(".brouillon"); box.innerHTML = brouillonHtml(o, e.target.dataset.lang); return; }
    if (act === "copier") {
      const ta = card.querySelector("textarea");
      try { await navigator.clipboard.writeText(ta.value); e.target.textContent = "Copié"; }
      catch { ta.focus(); ta.select(); e.target.textContent = "Texte sélectionné : Ctrl+C"; }
      return;
    }
    if (act === "supprimer") { estate.collees = estate.collees.filter(x => x.id !== id); delete estate.statuts[id]; saveE(); renderEmploi(); return; }
    if (STATUTS[act]) { estate.statuts[id] = estate.statuts[id] === act ? undefined : act; if (!estate.statuts[id]) delete estate.statuts[id]; saveE(); renderEmploi(); }
  });
  host.addEventListener("input", e => {
    if (e.target.id === "smin") { estate.scoreMin = +e.target.value; $("#smin-v").textContent = e.target.value; }
  });
  host.addEventListener("change", e => { if (e.target.id === "smin") { saveE(); renderEmploi(); } });
  host.addEventListener("submit", e => {
    if (e.target.id !== "coller-form") return;
    e.preventDefault();
    const o = {
      id: "c" + Date.now().toString(36), source: "Collée",
      titre: $("#c-titre").value.trim(), organisation: $("#c-org").value.trim(), pays: $("#c-lieu").value.trim(),
      lien: $("#c-lien").value.trim() || null, publie: new Date().toISOString().slice(0, 10), cloture: null,
      texte: $("#c-texte").value.trim().slice(0, 8000)
    };
    if (o.lien && !/^https?:\/\//.test(o.lien)) o.lien = null;
    estate.collees.unshift(o); estate.filtre = "toutes"; saveE(); renderEmploi();
    const card = document.querySelector(`.offre[data-id="${o.id}"]`);
    if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.querySelector('[data-act="brouillon"]').click(); }
  });
}

function brouillonHtml(o, lang) {
  return `<div class="br-head">
      <b>Brouillon à relire</b>
      <span class="seg small">${["fr", "en"].map(l => `<button type="button" data-act="lang" data-lang="${l}" aria-pressed="${l === lang}">${l.toUpperCase()}</button>`).join("")}</span>
    </div>
    <ul class="br-points">${pointsForts(o)}</ul>
    <textarea id="lt-${esc(o.id)}" rows="14" aria-label="Lettre de motivation">${esc(lettre(o, lang))}</textarea>
    <div class="offre-actions"><button type="button" class="btn primary" data-act="copier">Copier la lettre</button>${o.lien ? `<a class="btn" href="${esc(o.lien)}" target="_blank" rel="noopener">Ouvrir l'offre pour postuler</a>` : ""}</div>
    <p class="note">Relis et personnalise avant d'envoyer : rien n'est envoyé automatiquement.</p>`;
}

(async function initEmploi() {
  profil = await load("data/profil.json");
  if (!profil) { $("#emploi-body").innerHTML = `<p class="empty">Impossible de lire <code>data/profil.json</code>.</p>`; return; }
  wireEmploi();
  renderEmploi();
  await chercherRW(false);
  renderEmploi();
})();
