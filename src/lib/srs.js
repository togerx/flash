/*
 * Répétition espacée (variante de SM-2).
 *
 * Chaque carte porte, PAR UTILISATEUR, trois informations :
 *   etat  "inconnue" (jamais vue) · "encours" (acquisition, en minutes)
 *         · "connue" (maintien, en jours)
 *   I     intervalle en jours avant la prochaine révision
 *   EF    facteur d'aisance, multiplicateur de l'intervalle (jamais sous 1.3)
 * plus `due`, l'instant de la prochaine présentation, et `step` pour situer la
 * carte dans les paliers d'acquisition (0 → 1 min, 1 → 10 min).
 *
 * Ce module ne contient que du calcul : aucune écriture, aucun composant. Il
 * est ainsi vérifiable sans base ni interface.
 */

export const EF_MIN = 1.3;
export const EF_DEFAUT = 2.5;

const MINUTE = 60_000;
const JOUR = 86_400_000;

export const srsOf = (card, uid) => card?.srs?.[uid] || null;

export function etatCarte(card, uid) {
  const s = srsOf(card, uid);
  return s?.etat || "inconnue";
}

/* --- Phase d'acquisition : deux paliers, en minutes -----------------------
   Faux → la carte revient dans 1 minute. Juste → 10 minutes, puis passage en
   maintien. L'EF acquis lors d'un passage précédent est conservé : une carte
   oubliée n'efface pas son histoire. */
export function repondreAcquisition(s, juste, now = Date.now()) {
  const EF = s?.EF ?? EF_DEFAUT;

  if (!juste) return { etat: "encours", step: 0, I: s?.I || 0, EF, due: now + MINUTE };
  if ((s?.step ?? 0) === 0) return { etat: "encours", step: 1, I: s?.I || 0, EF, due: now + 10 * MINUTE };

  // Palier des 10 minutes validé : la carte entre en maintien.
  return { etat: "connue", step: null, I: 1, EF, due: now + JOUR };
}

/* --- Phase de maintien : quatre notes ------------------------------------
   1 Oubli · 2 Difficile · 3 Bien · 4 Facile
   Les intervalles sont arrondis au jour supérieur. */
export function repondreMaintien(s, note, now = Date.now()) {
  const EF0 = s?.EF ?? EF_DEFAUT;
  const I0 = s?.I || 1;

  if (note === 1) {
    // L'historique est conservé (EF, mais abaissé) ; la carte repasse par les
    // paliers courts de la session en cours, et son intervalle retombe à 1 jour.
    return { etat: "encours", step: 0, I: 1, EF: Math.max(EF_MIN, EF0 - 0.2), due: now + MINUTE };
  }

  let I;
  let EF = EF0;
  if (note === 2) { I = Math.ceil(I0 * 1.2); EF = Math.max(EF_MIN, EF0 - 0.15); }
  else if (note === 3) { I = Math.ceil(I0 * EF0); }
  else { I = Math.ceil(I0 * EF0 * 1.3); EF = EF0 + 0.15; }

  return { etat: "connue", step: null, I: Math.max(1, I), EF, due: now + I * JOUR };
}

/* Traduction d'une auto-évaluation libre (✓ / ✗) en progression espacée : les
   deux modes de révision alimentent ainsi le même historique. « Je sais » vaut
   une réponse juste, ou la note « Bien » si la carte est déjà en maintien. */
export function depuisAutoEval(s, etat, apprise, now = Date.now()) {
  if (etat === "connue") return repondreMaintien(s, apprise ? 3 : 1, now);
  return repondreAcquisition(s, apprise, now);
}

/* Statut manuel correspondant à une progression : une carte n'est « apprise »
   que lorsqu'elle est passée en maintien. */
export const learnedDepuisSrs = (srs) => (srs?.etat === "connue" ? true : false);

/* --- Union de deux progressions (fusion de comptes) -----------------------
   Deux appareils/comptes ont pu réviser la même carte séparément. On les réunit
   sans jamais rétrograder : « appris » l'emporte (connu ∪ connu = connu,
   pas connu ∪ pas connu = pas connu, connu ∪ pas connu = connu). Chaque entrée
   vaut true (apprise), false (à revoir) ou undefined (jamais vue). */
function unionLearned(a, b) {
  if (a === true || b === true) return true;
  if (a === false || b === false) return false;
  return undefined;
}

const etatRang = (s) => (s?.etat === "connue" ? 2 : s?.etat === "encours" ? 1 : 0);
const plusAvance = (a, b) => {
  const r = etatRang(a) - etatRang(b);
  if (r !== 0) return r > 0 ? a : b;
  return (a?.due ?? 0) >= (b?.due ?? 0) ? a : b;   // à état égal, l'échéance la plus lointaine
};

/* Choisit l'historique espacé à conserver : le plus avancé des deux (et, quand la
   carte devient « apprise », un état de maintien est préféré s'il existe, pour
   rester cohérent avec le statut retenu). */
function unionSrs(a, b, learned) {
  const cands = [a, b].filter(Boolean);
  if (!cands.length) return undefined;
  if (cands.length === 1) return cands[0];
  if (learned === true) {
    const connues = cands.filter((s) => s.etat === "connue");
    if (connues.length) return connues.reduce(plusAvance);
  }
  return cands.reduce(plusAvance);
}

/* Réunit deux { learned, srs } en une seule progression sans perte. */
export function unionProgress(a, b) {
  const learned = unionLearned(a?.learned, b?.learned);
  return { learned, srs: unionSrs(a?.srs, b?.srs, learned) };
}

/* Résultat d'une note, sans l'appliquer : sert à annoncer l'échéance sur les
   boutons (« Bien · 6 j »), ce qui rend le choix beaucoup plus lisible. */
export function apercu(s, etat, now = Date.now()) {
  if (etat === "connue") {
    return [1, 2, 3, 4].map((note) => ({ note, ...repondreMaintien(s, note, now) }));
  }
  return [false, true].map((juste) => ({ juste, ...repondreAcquisition(s, juste, now) }));
}

/* Délai lisible avant une échéance. */
export function delai(due, now = Date.now()) {
  const ms = Math.max(0, due - now);
  if (ms < 45 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  const jours = Math.round(ms / JOUR);
  if (jours < 1) return "< 1 j";
  if (jours < 31) return `${jours} j`;
  if (jours < 365) return `${Math.round(jours / 30)} mois`;
  return `${(jours / 365).toFixed(1)} an${jours >= 730 ? "s" : ""}`;
}

/* --- Composition d'une séance -------------------------------------------
   Les cartes échues d'abord (les plus en retard en tête), puis un contingent
   de cartes neuves : sans ce plafond, un paquet fraîchement importé noierait
   la séance sous des centaines de nouveautés. */
export function seance(cards, uid, { now = Date.now(), maxNouvelles = 10 } = {}) {
  const echues = [];
  const nouvelles = [];

  cards.forEach((c) => {
    const s = srsOf(c, uid);
    if (!s || s.etat === "inconnue") nouvelles.push(c);
    else if ((s.due ?? 0) <= now) echues.push(c);
  });

  echues.sort((a, b) => (srsOf(a, uid).due ?? 0) - (srsOf(b, uid).due ?? 0));
  return [...echues, ...nouvelles.slice(0, maxNouvelles)];
}

/* Compte ce qui attend l'utilisateur, pour l'afficher avant d'entrer. */
export function aReviser(cards, uid, { now = Date.now(), maxNouvelles = 10 } = {}) {
  let echues = 0;
  let nouvelles = 0;
  cards.forEach((c) => {
    const s = srsOf(c, uid);
    if (!s || s.etat === "inconnue") nouvelles++;
    else if ((s.due ?? 0) <= now) echues++;
  });
  return { echues, nouvelles: Math.min(nouvelles, maxNouvelles), total: echues + Math.min(nouvelles, maxNouvelles) };
}
