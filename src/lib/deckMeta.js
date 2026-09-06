/*
 * Métadonnées locales des paquets, par appareil (localStorage).
 *
 * Deux dates que Firestore ne porte pas de manière exploitable pour un tri :
 *   - `addedAt`    : première fois que ce paquet est apparu dans MA liste
 *                    (approxime la date de création pour mes paquets, la date
 *                    où je l'ai rejoint pour les autres) ;
 *   - `reviewedAt` : dernière fois que je l'ai révisé.
 * Un tri est une préférence d'affichage : le garder local évite toute écriture
 * Firestore et toute collision entre membres.
 */

const KEY = "flash.deckMeta";

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
  catch { return {}; }
}
function writeAll(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota */ }
}

/* Enregistre l'apparition des paquets absents du registre. Appelé à chaque
   mise à jour de la liste ; ne réécrit que s'il y a du nouveau. */
export function trackDecks(decks) {
  const m = readAll();
  let changed = false;
  const now = Date.now();
  decks.forEach((d) => {
    if (!m[d.id]) { m[d.id] = { addedAt: now }; changed = true; }
  });
  if (changed) writeAll(m);
}

export function markReviewed(deckId) {
  const m = readAll();
  m[deckId] = { ...(m[deckId] || {}), reviewedAt: Date.now() };
  writeAll(m);
}

export const deckAddedAt = (deckId) => readAll()[deckId]?.addedAt || 0;
export const deckReviewedAt = (deckId) => readAll()[deckId]?.reviewedAt || 0;
