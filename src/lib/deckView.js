/*
 * Affichage des listes de paquets (accueil et vitrine d'un groupe) :
 *   - "list" : une vignette complète par ligne (défaut) ;
 *   - "grid" : plusieurs vignettes compactes par ligne.
 * Préférence de l'appareil, commune aux deux listes.
 */

const KEY = "flash.deckView";

/* Lecture tolérante : toute valeur inconnue retombe sur la liste. */
export const parseDeckView = (raw) => (raw === "grid" ? "grid" : "list");

export function loadDeckView() {
  try { return parseDeckView(localStorage.getItem(KEY)); }
  catch { return "list"; }   // stockage indisponible (navigation privée)
}

export function saveDeckView(view) {
  try { localStorage.setItem(KEY, parseDeckView(view)); } catch { /* sans effet */ }
}
