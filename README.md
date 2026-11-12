# Foxerie

Petite app de la maison de Bagnolet : tâches du quotidien (Louise, Quentin, à deux), budget commun et montage financier de l'achat.

Site statique (GitHub Pages), sans base de données. Les données sont dans `data/` :

- `data/taches.json` : liste de départ des tâches. Les tâches ajoutées ou cochées dans l'app sont gardées sur le téléphone (navigateur).
- `data/finances.json` : les 6 comptes (Boursorama et Société Générale × Louise, Quentin, Foxerie joint) avec leur solde, les versements mensuels prévus et les opérations. Une opération : `{ "date": "2026-11-03", "compte": "sg-foxerie", "libelle": "…", "montant": -54.20, "categorie": "Courses" }` (négatif = débit). Virement d'un compte perso vers Foxerie : `"type": "versement", "qui": "louise"` (des deux côtés). Autre virement entre vos comptes : `"type": "interne"`, ignoré dans les totaux.
- `data/maison.json` : plan de financement, prêt, étapes de l'achat, factures de travaux.

⚠️ Le dépôt est public : tout ce qui est dans `data/` est lisible par n'importe qui.
