import { useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { loadDeckView, saveDeckView } from "../lib/deckView";

/* Préférence d'affichage des listes de paquets, lue au montage et enregistrée
   à chaque changement (voir lib/deckView.js). */
export function useDeckView() {
  const [view, setView] = useState(loadDeckView);
  const change = (v) => { setView(v); saveDeckView(v); };
  return [view, change];
}

/* Bouton icône : bascule liste ↔ grille compacte. L'icône montre l'affichage
   OBTENU au toucher (une action, comme le libellé). Même gabarit que le bouton
   de tri voisin ; `small` : hauteur des boutons de la barre d'un groupe. */
export default function ViewToggle({ view, onChange, small }) {
  const toGrid = view !== "grid";
  const Icon = toGrid ? LayoutGrid : Rows3;
  const label = toGrid ? "Afficher en grille compacte" : "Afficher une vignette par ligne";
  return (
    <button
      onClick={() => onChange(toGrid ? "grid" : "list")}
      aria-label={label}
      title={label}
      className={`flex ${small ? "h-9 w-9" : "h-[42px] w-[42px]"} shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-violet-300`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
