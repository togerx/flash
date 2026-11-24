import { useCallback, useRef } from "react";

/*
 * Appui long (doigt ou souris maintenu immobile), pour la sélection des paquets
 * et le déplacement des dossiers.
 *
 * - Bouger de plus de LONG_PRESS_SLOP_PX avant le délai annule : c'est un
 *   défilement ou un glissement, pas un appui long.
 * - Une fois déclenché, le clic qui suit le relâchement est avalé (sinon
 *   l'appui long ouvrirait aussi le paquet), ainsi que le menu contextuel
 *   qu'Android ou la souris afficheraient.
 * - Un élément marqué `data-no-longpress` (poignée de glisser…) est ignoré.
 *
 * `useLongPress(cb)` renvoie `bind(arg)`, qui donne les gestionnaires à poser
 * sur l'élément. `cb(arg, info)` reçoit `info.el` / `info.pointerId` pour
 * capturer le pointeur si l'appui long démarre un glisser.
 */

export const LONG_PRESS_MS = 450;
export const LONG_PRESS_SLOP_PX = 8;

export function useLongPress(onLongPress) {
  const state = useRef(null);   // { timer, x, y, fired, el, pointerId }
  const cb = useRef(onLongPress);
  cb.current = onLongPress;

  const clearTimer = () => {
    if (state.current?.timer) clearTimeout(state.current.timer);
    if (state.current) state.current.timer = null;
  };

  return useCallback((arg) => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || e.target.closest?.("[data-no-longpress], input, textarea, select")) return;
      clearTimer();
      const s = { x: e.clientX, y: e.clientY, fired: false, el: e.currentTarget, pointerId: e.pointerId, timer: null };
      s.timer = setTimeout(() => {
        s.timer = null;
        s.fired = true;
        navigator.vibrate?.(15);   // retour tactile, si le téléphone le permet
        cb.current(arg, s);
      }, LONG_PRESS_MS);
      state.current = s;
    },
    onPointerMove: (e) => {
      const s = state.current;
      if (s?.timer && Math.hypot(e.clientX - s.x, e.clientY - s.y) > LONG_PRESS_SLOP_PX) clearTimer();
    },
    onPointerUp: clearTimer,
    onPointerCancel: clearTimer,
    onClickCapture: (e) => {
      if (state.current?.fired) {
        e.stopPropagation();
        e.preventDefault();
        state.current = null;
      }
    },
    onContextMenu: (e) => {
      if (state.current?.timer || state.current?.fired) e.preventDefault();
    },
  }), []);   // eslint-disable-line react-hooks/exhaustive-deps
}
