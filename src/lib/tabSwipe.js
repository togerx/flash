/*
 * Glisser d'un onglet à l'autre (Paquets · Groupes · Compte) : décisions pures
 * (sans DOM), testées. Repris de Darts Scorer (features/home/tabSwipe.ts). Le
 * hook `useTabSwipe` ne fait que mesurer le doigt et appliquer ces règles.
 */

/* Ordre des onglets, de gauche à droite : SOURCE UNIQUE (la barre de
   navigation le reprend). */
export const TAB_ORDER = ["decks", "groups", "account"];

/* Déplacement minimal avant de décider l'axe : en deçà, c'est un simple appui. */
export const SLOP_PX = 10;
/* Un geste est horizontal s'il l'est franchement (sinon, c'est un défilement). */
const AXIS_RATIO = 1.3;
/* Glissé LONG : 30 % de la largeur pour changer d'onglet. Un effleurement en
   faisant défiler la page ne doit jamais changer d'écran. */
export const COMMIT_RATIO = 0.3;
/* Lancer rapide : la moitié de la distance suffit si le doigt part vite (px/ms). */
const FLICK_RATIO = 0.15;
const FLICK_VELOCITY = 0.6;
/* Au bout de la barre (pas d'onglet voisin), la page résiste : 25 % du déplacement. */
const RUBBER = 0.25;

/* Onglet voisin. `dir` = +1 quand le doigt part vers la GAUCHE (onglet de
   droite), -1 vers la droite. `null` au bout de la barre. */
export function neighborTab(tab, dir) {
  const i = TAB_ORDER.indexOf(tab) + dir;
  return i >= 0 && i < TAB_ORDER.length ? TAB_ORDER[i] : null;
}

/* Sens du geste d'après le déplacement horizontal (doigt vers la gauche = +1). */
export const swipeDir = (dx) => (dx < 0 ? 1 : -1);

/* Axe du geste, ou `null` tant qu'il est trop court pour trancher. */
export function swipeAxis(dx, dy) {
  if (Math.hypot(dx, dy) < SLOP_PX) return null;
  return Math.abs(dx) > Math.abs(dy) * AXIS_RATIO ? "x" : "y";
}

/* Déplacement affiché de la page : suit le doigt, ou résiste au bout de la barre. */
export function dragOffset(dx, hasTarget) {
  return hasTarget ? dx : dx * RUBBER;
}

/* Une zone qui défile latéralement (tableau large…) garde le geste tant qu'elle
   peut encore défiler dans ce sens ; en butée, elle le cède. */
export function scrollerKeepsSwipe(scrollLeft, maxScroll, dir) {
  return dir === 1 ? scrollLeft < maxScroll - 1 : scrollLeft > 1;
}

/* Entrée d'un onglet : il arrive du côté de son icône, d'autant plus loin que
   l'icône est éloignée. Après un glissé, toujours d'un cran (le geste a déjà
   parcouru le chemin). Renvoie le décalage de départ (% de largeur, signé) et
   la durée (ms). */
export function enterMotion(from, to, fromSwipeDir) {
  const delta = TAB_ORDER.indexOf(to) - TAB_ORDER.indexOf(from);
  const dir = fromSwipeDir ?? (delta > 0 ? 1 : -1);
  const steps = fromSwipeDir ? 1 : Math.max(1, Math.abs(delta));
  return { offset: dir * Math.min(48, 16 + 8 * steps), duration: 200 + 30 * steps };
}

/* Avancement vers le seuil de validation, de 0 à 1 (1 = relâcher change d'onglet). */
export function swipeProgress(dx, width) {
  return width <= 0 ? 0 : Math.min(1, Math.abs(dx) / (width * COMMIT_RATIO));
}

/* Le geste change-t-il d'onglet au relâchement ? Glissé long, ou lancé franc
   dans le même sens que le déplacement. Jamais sans onglet voisin. */
export function shouldCommit(dx, width, vx, hasTarget) {
  if (!hasTarget || width <= 0) return false;
  const dist = Math.abs(dx);
  if (dist >= width * COMMIT_RATIO) return true;
  return dist >= width * FLICK_RATIO && Math.abs(vx) >= FLICK_VELOCITY && Math.sign(vx) === Math.sign(dx);
}
