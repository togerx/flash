import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasOpenLayer } from "../components/ui";
import {
  dragOffset, enterMotion, neighborTab, scrollerKeepsSwipe, shouldCommit, swipeAxis, swipeDir, swipeProgress,
} from "./tabSwipe";

/*
 * Glisser d'un onglet à l'autre (glissé long gauche/droite), repris de Darts
 * Scorer (features/home/useTabSwipe.ts) :
 *
 * - la page SUIT LE DOIGT ; au bout de la barre, elle résiste ;
 * - une PASTILLE annonce l'onglet visé et se remplit au seuil (vibration
 *   légère) : relâcher change alors d'onglet ;
 * - la BARRETTE de la barre du bas suit le geste, puis file vers l'onglet ;
 * - sortie puis entrée animées ; au tap sur la barre, l'onglet arrive du côté
 *   de son icône (`enterMotion`).
 *
 * Événements TACTILES (passifs), pas pointeurs : un `pointercancel` coupe le
 * suivi dès que le navigateur prend la main pour défiler. Pas à la souris.
 * Désactivé si une fenêtre ou une sous-page (paquet, groupe) est ouverte, depuis
 * le bord gauche (geste retour), dans les champs et `[data-no-tab-swipe]`.
 * Tout le suivi passe par le DOM (transform, variables CSS) : aucun rendu React
 * par mouvement. `prefers-reduced-motion` : changement sans animation.
 *
 * Différence avec Darts Scorer : ici c'est le DOCUMENT qui défile (en-têtes
 * collants), pas un <main> ; « remettre en haut » = window.scrollTo.
 */

const EDGE_PX = 24;   // bande du bord gauche laissée au geste retour
const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
const EASE_IN = "cubic-bezier(.4,0,1,1)";
const OWN_GESTURE = 'input, textarea, select, [contenteditable="true"], [data-no-tab-swipe]';

/* Zone défilant latéralement sous le doigt (tableau large…), s'il y en a. */
function horizontalScroller(target, boundary) {
  for (let el = target instanceof Element ? target : null; el && el !== boundary; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) return el;
  }
  return null;
}

/* `shellRef` : coquille (porte --peek / --tab-drag et data-swiping, lus par la
   barre et la pastille). `pageRef` : élément déplacé (le contenu de l'onglet).
   `enabled` : faux pendant une révision. Renvoie la pastille à afficher
   ({ tab, side, armed }) ou null. */
export function useTabSwipe({ shellRef, pageRef, tab, onCommit, enabled = true }) {
  const [peek, setPeek] = useState(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const exitAnim = useRef(null);     // animation de sortie en cours
  const pendingDir = useRef(null);   // sens du glissé validé (entrée du bon côté)
  const prevTab = useRef(tab);

  useEffect(() => {
    const shell = shellRef.current;
    const page = pageRef.current;
    if (!shell || !page) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setVar = (name, v) => shell.style.setProperty(name, String(v));

    let g = null;                 // geste en cours
    let swallowClickUntil = 0;    // le « click » de fin de glissé n'ouvre rien

    const aim = (dir) => {
      if (!g) return;
      g.dir = dir;
      g.target = neighborTab(tabRef.current, dir);
      g.armed = false;
      setPeek(g.target ? { tab: g.target, side: dir === 1 ? "right" : "left", armed: false } : null);
    };
    const touchOf = (e, id) => [...e.changedTouches].find((t) => t.identifier === id);

    const start = (e) => {
      if (g || e.touches.length !== 1) return;          // à deux doigts : zoom
      if (!enabledRef.current || hasOpenLayer()) return;
      const t = e.touches[0];
      const rect = shell.getBoundingClientRect();
      if (t.clientX - rect.left < EDGE_PX) return;
      if (e.target instanceof Element && e.target.closest(OWN_GESTURE)) return;
      g = {
        id: t.identifier, x0: t.clientX, y0: t.clientY, width: window.innerWidth,
        scroller: horizontalScroller(e.target, page),
        axis: null, dir: 1, target: null, armed: false, offset: 0, lastX: t.clientX,
        samples: [{ x: t.clientX, t: e.timeStamp }],
      };
    };

    const move = (e) => {
      if (!g) return;
      if (e.touches.length > 1) { reset(); return; }   // second doigt : on lâche
      const t = touchOf(e, g.id);
      if (!t) return;
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      g.lastX = t.clientX;
      if (g.axis === null) {
        g.axis = swipeAxis(dx, dy);
        if (g.axis === null) return;
        const dir = swipeDir(dx);
        if (g.axis === "y" || (g.scroller && scrollerKeepsSwipe(g.scroller.scrollLeft, g.scroller.scrollWidth - g.scroller.clientWidth, dir))) {
          g = null;
          return;
        }
        shell.dataset.swiping = "true";
        aim(dir);
      } else if (swipeDir(dx) !== g.dir && dx !== 0) {
        aim(swipeDir(dx));   // le doigt est repassé de l'autre côté du départ
      }

      g.offset = dragOffset(dx, !!g.target);
      page.style.transform = `translateX(${g.offset}px)`;
      const progress = g.target ? swipeProgress(dx, g.width) : 0;
      setVar("--peek", progress);
      setVar("--tab-drag", g.target ? -g.offset / g.width : 0);
      const armed = progress >= 1;
      if (armed !== g.armed && g.target) {
        g.armed = armed;
        setPeek({ tab: g.target, side: g.dir === 1 ? "right" : "left", armed });
        if (armed) navigator.vibrate?.(10);
      }
      g.samples.push({ x: t.clientX, t: e.timeStamp });
      if (g.samples.length > 6) g.samples.shift();
    };

    const finish = (timeStamp, endX, allowCommit) => {
      if (!g) return;
      const gesture = g;
      g = null;
      if (gesture.axis !== "x") return;
      swallowClickUntil = timeStamp + 400;
      delete shell.dataset.swiping;

      // Vitesse sur les ~100 dernières ms (un doigt qui ralentit n'est pas un lancé).
      const last = gesture.samples[gesture.samples.length - 1];
      const ref = gesture.samples.find((sm) => last.t - sm.t <= 100) ?? last;
      const vx = last.t > ref.t ? (last.x - ref.x) / (last.t - ref.t) : 0;
      const dx = endX - gesture.x0;
      const commit = allowCommit && shouldCommit(dx, gesture.width, vx, !!gesture.target);

      page.style.transform = "";
      setVar("--peek", 0);
      if (commit && gesture.target) {
        const next = gesture.target;
        pendingDir.current = gesture.dir;
        setVar("--tab-drag", gesture.dir);   // la barrette file vers l'onglet visé
        if (reduced.matches) { commitRef.current(next); return; }
        const anim = page.animate(
          [
            { transform: `translateX(${gesture.offset}px)`, opacity: 1 },
            { transform: `translateX(${-gesture.dir * gesture.width}px)`, opacity: 0.2 },
          ],
          { duration: 170, easing: EASE_IN, fill: "forwards" },
        );
        exitAnim.current = anim;
        // Fin de la sortie… ou au plus tard un peu après : une animation suspendue
        // (page en arrière-plan) ne doit jamais bloquer le geste.
        let done = false;
        const go = () => { if (done) return; done = true; commitRef.current(next); };
        anim.finished.then(go).catch(() => {});
        window.setTimeout(go, 170 + 80);
      } else {
        setVar("--tab-drag", 0);   // retour élastique, barrette comprise
        if (!reduced.matches) {
          page.animate([{ transform: `translateX(${gesture.offset}px)` }, { transform: "translateX(0)" }], {
            duration: 220, easing: EASE_OUT,
          });
        }
      }
    };
    function reset() { if (g) finish(performance.now(), g.lastX, false); }

    const end = (e) => { if (!g) return; const t = touchOf(e, g.id); if (t) finish(e.timeStamp, t.clientX, true); };
    const cancel = (e) => { if (g && touchOf(e, g.id)) finish(e.timeStamp, g.lastX, false); };
    const swallow = (e) => {
      if (e.timeStamp < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); }
    };

    // Passifs : on ne bloque jamais le défilement natif.
    page.addEventListener("touchstart", start, { passive: true });
    page.addEventListener("touchmove", move, { passive: true });
    page.addEventListener("touchend", end);
    page.addEventListener("touchcancel", cancel);
    shell.addEventListener("click", swallow, true);
    return () => {
      page.removeEventListener("touchstart", start);
      page.removeEventListener("touchmove", move);
      page.removeEventListener("touchend", end);
      page.removeEventListener("touchcancel", cancel);
      shell.removeEventListener("click", swallow, true);
    };
  }, [shellRef, pageRef]);

  // Entrée du nouvel onglet (glissé validé OU tap sur la barre), du côté d'où il
  // vient. Avant affichage : pas de flash de la nouvelle page à sa place finale.
  useLayoutEffect(() => {
    const prev = prevTab.current;
    prevTab.current = tab;
    if (prev === tab) return;
    const shell = shellRef.current;
    const page = pageRef.current;
    if (!shell || !page) return;
    exitAnim.current?.cancel();
    exitAnim.current = null;
    shell.style.setProperty("--tab-drag", "0");
    window.scrollTo(0, 0);
    const motion = enterMotion(prev, tab, pendingDir.current ?? undefined);
    pendingDir.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    page.animate(
      [
        { transform: `translateX(${motion.offset}%)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: motion.duration, easing: EASE_OUT },
    );
  }, [tab, shellRef, pageRef]);

  return peek;
}
