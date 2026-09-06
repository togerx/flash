import { useEffect, useRef, useState } from "react";
import { EDGE_ZONE } from "./ui";

/*
 * Carte « balayable » au doigt (écrans tactiles). Pendant le glissé, la carte
 * suit le doigt ; au relâché, un balayage franc rejoue l'action de la flèche.
 *     →  droite   (précédent)      ←  gauche  (suivant)
 *     ↑  haut     (je sais)        ↓  bas     (à revoir)
 *
 * HORIZONTAL = effet de PILE (comme un jeu de cartes) :
 *   - glissé vers la GAUCHE (suivant) : la courante part vers la gauche et la
 *     SUIVANTE (`behind`) émerge DE DERRIÈRE (elle grandit jusqu'au premier plan) ;
 *   - glissé vers la DROITE (précédent) : la PRÉCÉDENTE (`front`) revient EN
 *     GLISSANT DEPUIS LE BORD GAUCHE (l'inverse exact : la carte qui venait de
 *     partir à gauche réapparaît par la gauche) et se pose au-dessus.
 * VERTICAL : la carte s'envole (fling=true) ; en guidée (fling=false) l'action
 * s'exécute et la carte revient (elle joue sa propre animation).
 *
 * Un simple toucher retourne la carte. Le contenu défilable d'une carte longue
 * défile encore (le geste n'est détourné que si le contenu ne peut plus défiler).
 */

const SEUIL_ACTION = 78;   // distance (px) du doigt validant un balayage
const SEUIL_AXE = 10;      // distance avant de « bouger »
const ENVOL = 560;         // distance d'envol vertical

export default function SwipeCard({
  className, style, label = "Retourner la carte", fling = true,
  onTap, onLeft, onRight, onUp, onDown, behind, front, corner, cornerShown, disabled, children,
}) {
  const ref = useRef(null);
  const geste = useRef(null);
  const touche = useRef(false);
  const [drag, setDrag] = useState(null);        // { dx, dy } pendant le glissé
  const [anim, setAnim] = useState(null);        // { type: "next"|"prev"|"fly", dir? }
  const [instant, setInstant] = useState(false); // reset sans transition après un enchaînement

  const props = useRef();
  props.current = { onTap, onLeft, onRight, onUp, onDown, behind, front, disabled, fling, anim };

  const contenuPeutDefiler = (cible, dy) => {
    for (let n = cible; n && n !== ref.current; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === "auto" || oy === "scroll") {
          const enHaut = n.scrollTop <= 0;
          const enBas = n.scrollTop + n.clientHeight >= n.scrollHeight - 1;
          if (dy > 0 && !enHaut) return true;
          if (dy < 0 && !enBas) return true;
        }
      }
    }
    return false;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const onStart = (e) => {
      const p = props.current;
      if (p.disabled || p.anim || e.touches.length !== 1) { geste.current = null; return; }
      if (e.target.closest?.("button, a, input, textarea, select")) { geste.current = null; return; }
      const t = e.touches[0];
      if (t.clientX <= EDGE_ZONE) { geste.current = null; return; }   // bord gauche = « retour » (ui.jsx)
      geste.current = { x0: t.clientX, y0: t.clientY, dx: 0, dy: 0, axe: null, scroll: false, bouge: false, cible: e.target };
      touche.current = true;
    };

    const onMove = (e) => {
      const s = geste.current;
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x0;
      const dy = t.clientY - s.y0;
      const p = props.current;

      if (!s.axe) {
        if (Math.abs(dx) < SEUIL_AXE && Math.abs(dy) < SEUIL_AXE) return;
        s.axe = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        s.bouge = true;
        if (s.axe === "x" && !p.onLeft && !p.onRight) s.scroll = true;
        if (s.axe === "y" && !p.onUp && !p.onDown) s.scroll = true;
        if (s.axe === "y" && contenuPeutDefiler(s.cible, dy)) s.scroll = true;
      }
      if (s.scroll) return;
      e.preventDefault();
      s.dx = dx; s.dy = dy;

      if (s.axe === "x") {
        // Résistance quand il n'y a pas de carte dans le sens du glissé.
        let vdx = dx;
        if (dx < 0 && !p.behind) vdx = dx * 0.25;   // pas de suivante
        if (dx > 0 && !p.front) vdx = dx * 0.25;    // pas de précédente
        setDrag({ dx: vdx, dy: 0 });
      } else {
        setDrag({ dx: 0, dy });
      }
    };

    const onEnd = () => {
      const s = geste.current;
      geste.current = null;
      if (!s || s.scroll) { setDrag(null); return; }
      if (!s.bouge) { setDrag(null); props.current.onTap?.(); return; }

      const adx = Math.abs(s.dx), ady = Math.abs(s.dy);
      if (Math.max(adx, ady) < SEUIL_ACTION) { setDrag(null); return; }

      const dir = adx > ady ? (s.dx > 0 ? "right" : "left") : (s.dy > 0 ? "down" : "up");
      const p = props.current;
      const action = { left: p.onLeft, right: p.onRight, up: p.onUp, down: p.onDown }[dir];
      if (!action) { setDrag(null); return; }

      if (dir === "left" || dir === "right") {
        const carte = dir === "left" ? p.behind : p.front;   // suivante | précédente
        if (!carte) { setDrag(null); return; }
        setDrag(null);
        setAnim({ type: dir === "left" ? "next" : "prev" });
        window.setTimeout(() => {
          setInstant(true);
          action();
          setAnim(null);
          requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
        }, 230);
        return;
      }

      // Vertical.
      setDrag(null);
      if (p.fling === false) { action(); return; }
      setAnim({ type: "fly", dir });
      window.setTimeout(() => {
        setInstant(true);
        action();
        setAnim(null);
        requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
      }, 210);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = () => {
    if (touche.current) { touche.current = false; return; }
    if (!disabled) onTap?.();
  };

  // --- Styles des trois couches (profondeur) ---------------------------------
  const W = ref.current?.offsetWidth || 400;
  const dx = drag?.dx || 0;
  const dy = drag?.dy || 0;
  const at = Math.min(1, Math.abs(dx) / (W * 0.8));   // progression 0..1

  const transition = drag
    ? "none"
    : anim
      ? "transform .24s cubic-bezier(.2,.7,.2,1), opacity .24s ease"
      : instant ? "none" : "transform .3s cubic-bezier(.2,.7,.2,1), opacity .3s ease";

  // Repos : seule la carte courante est visible. Suivante en retrait (plus
  // petite, derrière) ; précédente rangée hors-champ à GAUCHE — les deux cachées.
  let curT, curO = 1;
  let behT = "scale(.9)", behO = 0;
  let frT = "translateX(-110%)", frO = 0;

  if (anim?.type === "next") {                 // la courante part à gauche, la suivante monte de derrière
    curT = `translateX(${-W * 1.15}px) rotate(-9deg)`; curO = 0;
    behT = "scale(1)"; behO = 1;
  } else if (anim?.type === "prev") {          // la précédente revient au centre depuis la gauche
    frT = "translateX(0) rotate(0deg)"; frO = 1;
  } else if (anim?.type === "fly") {           // haut/bas : la courante part, la suivante monte de derrière
    curT = anim.dir === "up" ? `translateY(${-ENVOL}px)` : `translateY(${ENVOL}px)`; curO = 0;
    behT = "scale(1)"; behO = 1;
  } else if (dx < 0) {                          // glissé gauche → suivante émerge de derrière
    curT = `translate(${dx}px, ${dy}px) rotate(${dx * 0.03}deg)`;
    behT = `scale(${0.9 + 0.1 * at})`; behO = 0.35 + 0.65 * at;
  } else if (dx > 0) {                          // glissé droite → précédente revient EN GLISSANT DEPUIS LE BORD GAUCHE
    frT = `translateX(${-110 * (1 - at)}%) rotate(${-6 * (1 - at)}deg)`; frO = 1;
  } else if (dy !== 0) {                        // glissé vertical (haut/bas) → même effet que gauche : la suivante émerge
    const pv = Math.min(1, Math.abs(dy) / 240);
    curT = `translateY(${dy}px)`;
    behT = `scale(${0.9 + 0.1 * pv})`; behO = 0.35 + 0.65 * pv;
  } else {                                      // repos
    curT = undefined;
  }

  const layer = (t, o, z) => ({ transform: t, opacity: o, zIndex: z, transition, willChange: "transform, opacity" });

  // Retour couleur du glissé vertical : contour VERT (haut = je sais) ou ROUGE
  // (bas = à revoir), d'autant plus marqué que la carte est haute/basse. Reste
  // plein pendant l'envol.
  let vDir = null, vProg = 0;
  if (anim?.type === "fly") { vDir = anim.dir; vProg = 1; }
  else if (drag && dx === 0 && dy !== 0) { vDir = dy < 0 ? "up" : "down"; vProg = Math.min(1, Math.abs(dy) / SEUIL_ACTION); }
  const tintShadow = vDir === "up"
    ? "inset 0 0 0 4px rgb(16 185 129), 0 0 26px 4px rgb(16 185 129 / .4)"
    : "inset 0 0 0 4px rgb(244 63 94), 0 0 26px 4px rgb(244 63 94 / .4)";

  return (
    <div ref={ref} className={className} onClick={onClick} role="button" tabIndex={0} aria-label={label} style={style}>
      {behind && <div className="pointer-events-none absolute inset-0" style={layer(behT, behO, 1)}>{behind}</div>}
      <div className="absolute inset-0" style={layer(curT, curO, 2)}>
        {children}
        {/* Bouton de coin (crayon d'édition) : affiché seulement quand la carte
            est STATIQUE et retournée (cornerShown), masqué pendant tout mouvement
            (glissé/envol) et pendant le retournement — le délai à l'apparition
            laisse l'animation de flip se terminer avant qu'il ne surgisse. */}
        {corner && (() => {
          const visible = cornerShown && !drag && !anim;
          return (
            <div
              className="absolute right-2.5 top-2.5 z-10"
              style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
            >
              {corner}
            </div>
          );
        })()}
        {vDir && (
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{ opacity: vProg, boxShadow: tintShadow, transition: drag ? "none" : "opacity .18s ease" }}
          />
        )}
      </div>
      {front && <div className="pointer-events-none absolute inset-0" style={layer(frT, frO, 3)}>{front}</div>}
    </div>
  );
}
