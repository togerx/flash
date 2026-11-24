import { useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check } from "lucide-react";
import { useEscapeClose } from "./ui";

/*
 * Tri derrière UN seul bouton icône (accueil et vue paquet) : le menu propose le
 * critère puis le sens, chacun avec une coche sur le choix courant.
 *
 * - `options` : [{ key, label }] ; `value` : { key, dir: "asc" | "desc" }.
 * - `dirLabels(key)` : libellés du sens pour ce critère ({ asc, desc }), p. ex.
 *   « A → Z » / « Z → A » pour un texte, « Plus ancien d'abord » pour une date.
 * - `defaultDir(key)` : sens appliqué quand on change de critère.
 *
 * Choisir referme le menu. Il se ferme aussi au clic à côté et à Échap (pile
 * des fenêtres : le glissé entre onglets est suspendu tant qu'il est ouvert).
 * Clavier : ↑ ↓ parcourent les choix, Entrée / Espace valident.
 */
export default function SortMenu({ label = "Trier", options, value, onChange, dirLabels, defaultDir = () => "asc" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const menu = useRef(null);
  const current = options.find((o) => o.key === value.key) || options[0];
  const dirs = dirLabels(current.key);

  // Fermer au clic / toucher à côté.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // À l'ouverture, le focus va sur le choix coché (navigation au clavier).
  useEffect(() => {
    if (open) menu.current?.querySelector('[aria-checked="true"]')?.focus();
  }, [open]);

  const choose = (next) => { onChange(next); setOpen(false); };
  const onKeyDown = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...menu.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  const DirIcon = value.dir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} : ${current.label}, ${dirs[value.dir]}`}
        title={`${current.label} · ${dirs[value.dir]}`}
        className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl border transition ${
          open
            ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-500/15 dark:text-violet-200"
            : "border-slate-200 bg-white text-slate-600 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-violet-300"
        }`}
      >
        <DirIcon size={18} aria-hidden="true" />
      </button>

      {open && <SortMenuPanel {...{ menu, onKeyDown, label, options, value, dirs, choose, defaultDir }} close={() => setOpen(false)} />}
    </div>
  );
}

/* Panneau du menu : enregistré dans la pile Échap tant qu'il est monté. */
function SortMenuPanel({ menu, onKeyDown, label, options, value, dirs, choose, defaultDir, close }) {
  useEscapeClose(close);   // Échap : referme sans rien changer
  const item = (checked, text, onClick, key) => (
    <button
      key={key}
      role="menuitemradio"
      aria-checked={checked}
      onClick={onClick}
      className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm outline-none transition focus-visible:bg-slate-100 dark:focus-visible:bg-slate-800 ${
        checked
          ? "font-semibold text-violet-700 dark:text-violet-300"
          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
      }`}
    >
      <span className="flex w-4 shrink-0 justify-center">{checked && <Check size={16} aria-hidden="true" />}</span>
      <span className="flex-1">{text}</span>
    </button>
  );

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="sort-menu absolute right-0 top-full z-40 mt-2 w-64 origin-top-right rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
    >
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Trier par</p>
      {options.map((o) => item(
        o.key === value.key,
        o.label,
        () => choose(o.key === value.key ? value : { key: o.key, dir: defaultDir(o.key) }),
        o.key,
      ))}
      <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-800" />
      <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Ordre</p>
      {["asc", "desc"].map((d) => item(value.dir === d, dirs[d], () => choose({ key: value.key, dir: d }), d))}
    </div>
  );
}
