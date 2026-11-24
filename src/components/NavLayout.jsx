import { useEffect, useRef, useState } from "react";
import { Layers, Users, UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import { Logo } from "./ui";
import { isReviewing, onReviewingChange } from "../lib/appUpdate";
import { TAB_ORDER } from "../lib/tabSwipe";
import { useTabSwipe } from "../lib/useTabSwipe";

/*
 * Navigation principale (décisions utilisateur) :
 *   - trois onglets : Paquets · Groupes · Compte ;
 *   - moins de 768 px de large (téléphone, même tourné) : barre d'onglets EN BAS,
 *     au pouce ; à partir de 768 px (tablette, ordinateur) : barre LATÉRALE ;
 *   - visible partout (y compris dans un paquet ou un groupe), SAUF pendant une
 *     révision, qui garde tout l'écran.
 *
 * Le contenu est toujours rendu au même endroit de l'arbre React : seules les
 * classes changent quand une révision démarre. Le démonter ferait perdre l'état
 * de la vue paquet, qui héberge elle-même la révision.
 *
 * Gestes et animations repris de Darts Scorer (voir lib/useTabSwipe.js) :
 * glissé long gauche/droite entre onglets avec pastille annonçant l'onglet
 * visé, barrette sous l'onglet actif qui suit le doigt, icône active soulevée,
 * entrée de l'onglet du côté de son icône.
 */

const TAB_META = {
  decks: { label: "Paquets", Icon: Layers },
  groups: { label: "Groupes", Icon: Users },
  account: { label: "Compte", Icon: UserRound },
};
// Ordre : celui de lib/tabSwipe (source unique, partagée avec le geste).
export const NAV_TABS = TAB_ORDER.map((key) => ({ key, ...TAB_META[key] }));

/* Vrai pendant une révision (les écrans de révision se signalent, voir
   lib/appUpdate.js). */
export function useReviewing() {
  const [reviewing, setReviewing] = useState(isReviewing);
  useEffect(() => onReviewingChange(setReviewing), []);
  return reviewing;
}

export default function NavLayout({ tab, onTab, badges = {}, pseudo, children }) {
  const reviewing = useReviewing();
  const showNav = !reviewing;
  const shellRef = useRef(null);
  const pageRef = useRef(null);
  const peek = useTabSwipe({ shellRef, pageRef, tab, onCommit: onTab, enabled: showNav });
  const tabIndex = Math.max(0, TAB_ORDER.indexOf(tab));

  // Classe sur <html> : les éléments flottants hors de cet arbre (bandeau de
  // mise à jour) se décalent pour ne pas recouvrir la barre (voir index.css).
  useEffect(() => {
    document.documentElement.classList.toggle("has-app-nav", showNav);
    return () => document.documentElement.classList.remove("has-app-nav");
  }, [showNav]);

  return (
    // `group/nav` (groupe NOMMÉ : un simple `group` ferait réagir au survol de toute
    // la page les infobulles des descendants) + data-swiping (posé par le geste) :
    // coupe les transitions pendant
    // que la barrette et la pastille suivent le doigt.
    <div ref={shellRef} className={`group/nav bg-slate-100 dark:bg-slate-950 ${showNav ? "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-56" : ""}`}>
      {/* Contenu de l'onglet : c'est lui qui suit le doigt. `pan-y` : le
          navigateur garde le défilement vertical (et le zoom) et nous laisse les
          gestes horizontaux. */}
      <div ref={pageRef} className="[touch-action:pan-y_pinch-zoom]">
        {children}
      </div>

      {showNav && (
        <>
          {/* Barre latérale (tablette, ordinateur). */}
          <nav
            aria-label="Navigation principale"
            className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-900 md:flex"
          >
            <div className="mb-6 flex items-center gap-2 px-2">
              <Logo size={34} />
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Flash</span>
            </div>
            <ul className="space-y-1">
              {NAV_TABS.map(({ key, label, Icon }) => {
                const active = tab === key;
                return (
                  <li key={key}>
                    <button
                      onClick={() => onTab(key)}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                        active
                          ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      <Icon size={19} aria-hidden="true" className="shrink-0" />
                      <span className="flex-1 text-left">{label}</span>
                      {badges[key] && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" aria-label="Nouveautés" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {pseudo && (
              <button
                onClick={() => onTab("account")}
                className="mt-auto flex min-h-[44px] items-center gap-2.5 rounded-xl px-2 text-left text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{pseudo[0]?.toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{pseudo}</span>
              </button>
            )}
          </nav>

          {/* Barre d'onglets en bas (téléphone). */}
          <nav
            aria-label="Navigation principale"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
          >
            <ul className="relative mx-auto flex h-16 max-w-md">
              {/* Barrette de l'onglet actif : GLISSE d'onglet en onglet ; pendant
                  un glissé de page, `--tab-drag` la fait suivre le doigt. */}
              <li
                aria-hidden="true"
                className="pointer-events-none absolute -top-px left-0 h-[3px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-data-[swiping=true]/nav:transition-none motion-reduce:transition-none"
                style={{ width: `${100 / NAV_TABS.length}%`, transform: `translateX(calc((${tabIndex} + var(--tab-drag, 0)) * 100%))` }}
              >
                <span className="mx-auto block h-full w-8 rounded-b-full bg-violet-600 dark:bg-violet-400" />
              </li>
              {NAV_TABS.map(({ key, label, Icon }) => {
                const active = tab === key;
                return (
                  <li key={key} className="flex-1">
                    <button
                      onClick={() => onTab(key)}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                        active ? "text-violet-700 dark:text-violet-300" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                      }`}
                    >
                      {/* L'icône active se soulève : signal non coloré, en plus de la teinte. */}
                      <span className={`relative transition-transform duration-300 motion-reduce:transition-none ${active ? "-translate-y-0.5 scale-110" : ""}`}>
                        <Icon size={22} aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                        {badges[key] && (
                          <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-white dark:ring-slate-900" aria-label="Nouveautés" />
                        )}
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}

      {peek && <SwipePeekPill peek={peek} />}
    </div>
  );
}

/* Pastille latérale pendant un glissé : annonce l'onglet qui arrive, glisse
   depuis le bord au rythme du doigt (`--peek`, 0 → 1) et se remplit quand
   relâcher le validera. Fixe : la page défile, pas la coquille. */
function SwipePeekPill({ peek }) {
  const meta = TAB_META[peek.tab];
  const towards = peek.side === "right" ? 1 : -1;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-1/2 z-50 transition-[opacity,transform] duration-200 group-data-[swiping=true]/nav:transition-none motion-reduce:transition-none"
      style={{
        [peek.side]: 12,
        opacity: "var(--peek, 0)",
        transform: `translate(calc(${towards} * (1 - var(--peek, 0)) * 32px), -50%)`,
      }}
    >
      <div
        className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold shadow-lg ring-1 transition-colors duration-150 ${
          peek.armed
            ? "bg-violet-600 text-white ring-violet-600"
            : "bg-white text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
        }`}
      >
        {peek.side === "left" && <ChevronLeft size={16} aria-hidden="true" />}
        <meta.Icon size={18} aria-hidden="true" />
        {meta.label}
        {peek.side === "right" && <ChevronRight size={16} aria-hidden="true" />}
      </div>
    </div>
  );
}
