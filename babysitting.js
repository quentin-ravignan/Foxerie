"use strict";
/* Foxerie · Babysitting : calendrier des gardes, total du mois et formulaire de déclaration.
   Utilisé par l'onglet Babysitting (index.html) et par la page de Nephelie (nephelie.html).
   Les gardes sont dans un Google Sheet, servi par un Google Apps Script (outils/babysitting.gs). */
(function () {
  const q = s => document.querySelector(s);
  const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n || 0);
  const dureeTxt = x => { const m = Math.round((x || 0) * 60), hh = Math.floor(m / 60), mm = m % 60; return mm ? `${hh} h ${String(mm).padStart(2, "0")}` : `${hh} h`; };
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const memo = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  const CODE_KEY = "foxerie.baby.code";

  let cfg = null, gardes = [], tarif = 10, etat = "chargement", erreur = "";
  const now = new Date();
  let mois = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const decaler = (k, n) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const nomMois = k => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); };

  async function charger() {
    if (!cfg.script_url) { etat = "sans_script"; return; }
    etat = "chargement"; rendre();
    try {
      const r = await fetch(cfg.script_url, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "réponse invalide");
      gardes = j.gardes || []; tarif = j.tarif || cfg.tarif || 10; etat = "ok";
    } catch (e) { etat = "erreur"; erreur = e.message; }
  }

  async function envoyer(corps) {
    const r = await fetch(cfg.script_url, { method: "POST", body: JSON.stringify(corps) });
    return r.json();
  }

  function calendrier() {
    const [y, m] = mois.split("-").map(Number);
    const premier = new Date(y, m - 1, 1), nbJours = new Date(y, m, 0).getDate();
    const decal = (premier.getDay() + 6) % 7;
    const parJour = {};
    gardes.filter(g => g.date.startsWith(mois)).forEach(g => { (parJour[g.date] = parJour[g.date] || []).push(g); });
    const auj = iso(new Date());
    let cases = "";
    for (let i = 0; i < decal; i++) cases += `<div class="cal-c vide"></div>`;
    for (let j = 1; j <= nbJours; j++) {
      const d = `${mois}-${pad(j)}`, gs = parJour[d] || [];
      const tot = gs.reduce((a, g) => a + g.heures, 0);
      cases += `<div class="cal-c${gs.length ? " garde" : ""}${d === auj ? " auj" : ""}" title="${gs.map(g => `${g.arrivee}–${g.depart}`).join(", ")}">
        <span class="cal-j">${j}</span>${gs.length ? `<b>${dureeTxt(tot)}</b><small>${gs.map(g => h(g.arrivee) + "–" + h(g.depart)).join("<br>")}</small>` : ""}</div>`;
    }
    return `<div class="cal">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map(x => `<div class="cal-h">${x}</div>`).join("")}${cases}</div>`;
  }

  function rendre() {
    const host = q("#baby-body"); if (!host) return;
    const duMois = gardes.filter(g => g.date.startsWith(mois)).sort((a, b) => (a.date + a.arrivee).localeCompare(b.date + b.arrivee));
    const heures = duMois.reduce((a, g) => a + g.heures, 0);
    const msg = {
      chargement: `<p class="note">Chargement des gardes…</p>`,
      erreur: `<p class="note neg">Impossible de lire les gardes : ${h(erreur)}</p>`,
      sans_script: `<div class="card waiting"><strong>Pas encore branché</strong><span class="muted">Le Google Sheet des gardes n'est pas encore relié (adresse du script à mettre dans <code>data/babysitting.json</code>).</span></div>`
    }[etat] || "";
    host.innerHTML = `
      ${msg}
      <div class="kpis">
        <div class="card kpi"><div class="label">À payer à ${h(cfg.nom)} pour ${nomMois(mois)}</div><div class="v">${eur(heures * tarif)}</div><div class="d">${dureeTxt(heures)} × ${eur(tarif)} de l'heure</div></div>
        <div class="card kpi"><div class="label">Gardes du mois</div><div class="v">${duMois.length}</div><div class="d">${duMois.length ? "Dernière le " + new Date(duMois[duMois.length - 1].date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "Aucune pour l'instant"}</div></div>
        <div class="card kpi"><div class="label">Heures du mois</div><div class="v">${dureeTxt(heures)}</div><div class="d">Depuis le début : ${eur(gardes.reduce((a, g) => a + g.heures, 0) * tarif)}</div></div>
      </div>
      <div class="card">
        <div class="cal-nav"><button type="button" class="btn" data-mois="-1" aria-label="Mois précédent">‹</button><h3>${nomMois(mois)}</h3><button type="button" class="btn" data-mois="1" aria-label="Mois suivant">›</button></div>
        ${calendrier()}
      </div>
      <div class="card">
        <h3>Détail des gardes</h3>
        <div class="scroll"><table class="tx">
          <thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th class="r">Durée</th><th class="r">Montant</th><th></th></tr></thead>
          <tbody>${duMois.map(g => `<tr><td>${new Date(g.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}${g.note ? `<small class="sub-d">${h(g.note)}</small>` : ""}</td><td>${h(g.arrivee)}</td><td>${h(g.depart)}</td><td class="r">${dureeTxt(g.heures)}</td><td class="r">${eur(g.heures * tarif)}</td><td class="r"><button type="button" class="btn ghost" data-suppr="${h(g.id)}" aria-label="Supprimer la garde du ${h(g.date)}">×</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Aucune garde déclarée ce mois-ci.</td></tr>`}
          ${duMois.length ? `<tr class="tot"><td colspan="3"><b>Total</b></td><td class="r"><b>${dureeTxt(heures)}</b></td><td class="r"><b>${eur(heures * tarif)}</b></td><td></td></tr>` : ""}</tbody>
        </table></div>
        <p class="note" id="baby-suppr-msg"></p>
      </div>`;
  }

  function formulaire() {
    const f = q("#baby-form"); if (!f) return;
    f.querySelector("#bf-date").value = iso(new Date());
    f.querySelector("#bf-code").value = memo.get(CODE_KEY, "");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const out = q("#bf-msg"), btn = f.querySelector("button[type=submit]");
      const corps = {
        action: "ajouter", code: f.querySelector("#bf-code").value.trim(),
        date: f.querySelector("#bf-date").value, arrivee: f.querySelector("#bf-arrivee").value, depart: f.querySelector("#bf-depart").value,
        note: f.querySelector("#bf-note").value.trim()
      };
      if (!cfg.script_url) { out.textContent = "Le formulaire n'est pas encore relié au Google Sheet."; out.className = "note neg"; return; }
      btn.disabled = true; out.textContent = "Envoi…"; out.className = "note";
      try {
        const r = await envoyer(corps);
        if (!r.ok) throw new Error(r.erreur);
        memo.set(CODE_KEY, corps.code);
        out.textContent = `C'est noté : ${dureeTxt(r.heures)} le ${new Date(corps.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}, soit ${eur(r.heures * tarif)}. Merci !`;
        out.className = "note pos";
        f.querySelector("#bf-note").value = "";
        mois = corps.date.slice(0, 7);
        await charger(); rendre();
      } catch (err) {
        out.textContent = "Pas enregistré : " + err.message; out.className = "note neg";
      } finally { btn.disabled = false; }
    });
  }

  function brancher() {
    document.addEventListener("click", async e => {
      const t = e.target;
      if (t.dataset && t.dataset.mois) { mois = decaler(mois, +t.dataset.mois); rendre(); return; }
      if (t.dataset && t.dataset.suppr) {
        const msg = q("#baby-suppr-msg");
        const code = memo.get(CODE_KEY, "");
        if (!code) { msg.textContent = "Pour supprimer, il faut d'abord avoir déclaré une garde avec le code sur cet appareil."; msg.className = "note neg"; return; }
        if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Confirmer ?"; return; }
        t.disabled = true;
        try { const r = await envoyer({ action: "supprimer", id: t.dataset.suppr, code }); if (!r.ok) throw new Error(r.erreur); await charger(); rendre(); }
        catch (err) { msg.textContent = "Suppression impossible : " + err.message; msg.className = "note neg"; t.disabled = false; }
      }
    });
  }

  (async function init() {
    if (!q("#baby-body") && !q("#baby-form")) return;
    try { cfg = await (await fetch("data/babysitting.json", { cache: "no-cache" })).json(); } catch { cfg = { nom: "Nephelie", tarif: 10, script_url: "" }; }
    tarif = cfg.tarif || 10;
    brancher(); formulaire(); rendre();
    await charger(); rendre();
  })();
})();
