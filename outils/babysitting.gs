/**
 * Foxerie · Babysitting
 * Google Apps Script lié au Google Sheet « Foxerie Babysitting ».
 * Déployé en application web (exécuter en tant que : moi ; accès : tout le monde).
 *  - GET  : renvoie toutes les gardes en JSON (lu par Foxerie).
 *  - POST : ajoute ou supprime une garde. Le code doit être celui écrit dans l'onglet « Réglages », cellule B2.
 * Aucun code secret n'est écrit ici : il est dans le Sheet, saisi par Quentin.
 */
const ONGLET = "Gardes";
const ENTETE = ["id", "date", "arrivee", "depart", "heures", "note", "declare_le"];

function feuille_() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(ONGLET);
  if (!s) {
    s = ss.insertSheet(ONGLET);
    s.getRange("A:G").setNumberFormat("@");
    s.appendRow(ENTETE);
    s.setFrozenRows(1);
  }
  if (!ss.getSheetByName("Réglages")) {
    const r = ss.insertSheet("Réglages");
    r.getRange("A1:B3").setValues([["Réglage", "Valeur"], ["Code de déclaration", ""], ["Tarif horaire (€)", "10"]]);
    r.getRange("B2").setNumberFormat("@");
  }
  return s;
}

function sortie_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function texte_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Europe/Paris", v.getFullYear() < 1900 ? "HH:mm" : "yyyy-MM-dd");
  return String(v == null ? "" : v);
}

function doGet() {
  const lignes = feuille_().getDataRange().getValues().slice(1).filter(l => l[0]);
  const gardes = lignes.map(l => ({
    id: texte_(l[0]), date: texte_(l[1]), arrivee: texte_(l[2]), depart: texte_(l[3]),
    heures: Number(l[4]) || 0, note: texte_(l[5]), declare_le: texte_(l[6])
  }));
  const tarif = Number(SpreadsheetApp.getActive().getSheetByName("Réglages").getRange("B3").getValue()) || 10;
  return sortie_({ ok: true, tarif: tarif, gardes: gardes });
}

function minutes_(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const s = feuille_();
    let b;
    try { b = JSON.parse(e.postData.contents); } catch (err) { return sortie_({ ok: false, erreur: "Requête illisible." }); }
    const code = String(SpreadsheetApp.getActive().getSheetByName("Réglages").getRange("B2").getValue() || "").trim();
    if (!code) return sortie_({ ok: false, erreur: "Aucun code n'est encore défini dans le Sheet (onglet Réglages, cellule B2)." });
    if (String(b.code || "").trim() !== code) return sortie_({ ok: false, erreur: "Code incorrect." });

    if (b.action === "supprimer") {
      const ids = s.getRange(1, 1, s.getLastRow(), 1).getValues().map(r => String(r[0]));
      const i = ids.indexOf(String(b.id));
      if (i < 1) return sortie_({ ok: false, erreur: "Garde introuvable." });
      s.deleteRow(i + 1);
      return sortie_({ ok: true });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return sortie_({ ok: false, erreur: "Date invalide." });
    const a = minutes_(b.arrivee), d = minutes_(b.depart);
    if (a === null || d === null) return sortie_({ ok: false, erreur: "Heures invalides (format 18:30)." });
    let duree = d - a;
    if (duree <= 0) duree += 24 * 60; // garde qui passe minuit
    if (duree > 16 * 60) return sortie_({ ok: false, erreur: "Plus de 16 heures : vérifie les horaires." });
    const heures = Math.round(duree / 60 * 100) / 100;
    const id = Utilities.getUuid().slice(0, 8);
    s.appendRow([id, b.date, b.arrivee, b.depart, String(heures), String(b.note || "").slice(0, 200),
      Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm")]);
    return sortie_({ ok: true, id: id, heures: heures });
  } finally {
    lock.releaseLock();
  }
}
