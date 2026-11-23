/*
 * Tri d'AFFICHAGE des cartes d'un paquet (préférence personnelle).
 *
 * Décision utilisateur : le tri ne change que l'affichage de celui qui trie ;
 * l'ordre du paquet (champ `order`, réglé au glisser-déposer) reste celui de
 * tout le monde. Choix mémorisé sur l'appareil.
 *
 * Clés :
 *   - "deck"    : ordre du paquet (tel que livré par watchCards, trié sur `order`)
 *   - "created" : date de création de la carte
 *   - "recto"   : texte de la question, ordre alphabétique
 *   - "verso"   : texte de la réponse, ordre alphabétique
 *
 * Fonction pure : `textOf` extrait le texte affichable (balisage retiré), passé
 * par l'appelant pour garder ce module sans dépendance d'interface.
 */

export const CARD_SORTS = [
  { key: "deck", label: "Ordre du paquet" },
  { key: "created", label: "Date de création" },
  { key: "recto", label: "Question" },
  { key: "verso", label: "Réponse" },
];

const SORT_KEY = "flash.cardSort";
const KEYS = new Set(CARD_SORTS.map((s) => s.key));

/* Préférence enregistrée (ou ordre du paquet par défaut). Le stockage peut être
   indisponible (navigation privée) : on retombe alors sur le défaut. */
export function loadCardSort() {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY) || "null");
    if (v && KEYS.has(v.key) && (v.dir === "asc" || v.dir === "desc")) return v;
  } catch { /* stockage indisponible ou valeur illisible */ }
  return { key: "deck", dir: "asc" };
}

export function saveCardSort(sort) {
  try { localStorage.setItem(SORT_KEY, JSON.stringify(sort)); } catch { /* sans effet */ }
}

/* L'ordre « naturel » (celui où le glisser-déposer a un sens). */
export const isDeckOrder = (sort) => sort.key === "deck" && sort.dir === "asc";

// Date de création en ms. Une carte tout juste ajoutée a un horodatage serveur
// encore en attente (null) : c'est la plus récente.
const createdMs = (c) => c.createdAt?.toMillis?.() ?? Number.POSITIVE_INFINITY;

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/* Renvoie une NOUVELLE liste triée (la liste reçue n'est pas modifiée).
   - Les cartes sans texte sur le côté trié (image seule) vont toujours à la fin,
     quel que soit le sens : les remonter en tête en « Z → A » n'aiderait personne.
   - À égalité, l'ordre du paquet départage : le tri est stable et prévisible. */
export function sortCards(cards, sort, textOf = (s) => s || "") {
  const dir = sort.dir === "desc" ? -1 : 1;
  const indexed = cards.map((card, i) => ({ card, i }));

  if (sort.key === "deck") {
    return (dir === 1 ? indexed : indexed.reverse()).map((x) => x.card);
  }

  if (sort.key === "created") {
    return indexed
      .sort((a, b) => dir * (createdMs(a.card) - createdMs(b.card)) || a.i - b.i)
      .map((x) => x.card);
  }

  const field = sort.key === "verso" ? "versoText" : "rectoText";
  const withText = indexed.map((x) => ({ ...x, t: textOf(x.card[field]).trim() }));
  return withText
    .sort((a, b) => {
      if (!a.t !== !b.t) return a.t ? -1 : 1;           // vides en dernier
      return dir * collator.compare(a.t, b.t) || a.i - b.i;
    })
    .map((x) => x.card);
}
