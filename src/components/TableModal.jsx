import { useState } from "react";
import { X, Plus, Minus, Table as TableIcon } from "lucide-react";
import { Modal } from "./ui";
import { continueList } from "../lib/listInput";

/*
 * Composition d'un tableau à la souris plutôt qu'en tapant des barres verticales.
 * On règle les dimensions, on remplit les cellules, et le balisage texte
 * (« | a | b | ») n'est produit qu'à l'insertion.
 */

const MAX_COLS = 6;
const MAX_ROWS = 12;

const vide = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(""));

export default function TableModal({ onInsert, onClose }) {
  const [grid, setGrid] = useState(() => vide(3, 2));
  const [header, setHeader] = useState(true);

  const rows = grid.length;
  const cols = grid[0].length;

  const setCell = (r, c, v) =>
    setGrid((g) => g.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)));

  const resize = (dRows, dCols) => {
    const nr = Math.min(MAX_ROWS, Math.max(1, rows + dRows));
    const nc = Math.min(MAX_COLS, Math.max(1, cols + dCols));
    setGrid((g) =>
      Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => g[i]?.[j] ?? "")));
  };

  /* Une ligne de tableau tient sur une seule ligne de texte : les retours à la
     ligne d'une cellule sont encodés en <br>, et les barres verticales saisies
     deviennent des barres obliques pour ne pas casser le découpage. */
  const insert = () => {
    const encode = (c) =>
      c.trim().replace(/\|/g, "/").replace(/\r?\n/g, "<br>") || " ";
    const lignes = grid.map((r) => `| ${r.map(encode).join(" | ")} |`);
    if (header && lignes.length > 1) lignes.splice(1, 0, "|---|");
    onInsert(lignes.join("\n") + "\n");
  };

  const rempli = grid.some((r) => r.some((c) => c.trim()));

  return (
    <Modal onClose={onClose} wide>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <TableIcon size={18} /> Insérer un tableau
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Stepper label="Lignes" value={rows} onLess={() => resize(-1, 0)} onMore={() => resize(1, 0)} />
          <Stepper label="Colonnes" value={cols} onLess={() => resize(0, -1)} onMore={() => resize(0, 1)} />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={header}
              onChange={(e) => setHeader(e.target.checked)}
              className="h-4 w-4 accent-violet-600"
            />
            Première ligne = en-tête
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              {grid.map((row, r) => (
                <tr key={r} className={header && r === 0 ? "bg-slate-50 dark:bg-slate-800/60" : ""}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-slate-200 dark:border-slate-700 p-0 align-top">
                      {/* Zone multiligne : Entrée revient à la ligne dans la
                          cellule et poursuit une liste commencée par « - » ou « 1. ». */}
                      <textarea
                        value={cell}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onKeyDown={(e) => continueList(e, (v) => setCell(r, c, v))}
                        rows={Math.min(6, Math.max(1, cell.split("\n").length))}
                        placeholder={header && r === 0 ? `Colonne ${c + 1}` : "—"}
                        className={`w-full min-w-[130px] resize-none bg-transparent px-2.5 py-2 text-sm leading-snug outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus-visible:bg-violet-50 dark:focus-visible:bg-violet-500/10 ${
                          header && r === 0 ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-700 dark:text-slate-300"
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Entrée revient à la ligne dans une cellule. Commencez une ligne par «&nbsp;-&nbsp;» ou
          «&nbsp;1.&nbsp;» pour une liste, la suite se numérote toute seule.
        </p>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
        <button onClick={onClose} className="flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 sm:flex-none sm:py-2">Annuler</button>
        <button
          onClick={insert}
          disabled={!rempli}
          data-primary
          className="flex-1 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2"
        >
          Insérer le tableau
        </button>
      </div>
    </Modal>
  );
}

function Stepper({ label, value, onLess, onMore }) {
  const btn = "flex h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 transition hover:text-violet-700 dark:hover:text-violet-300 hover:ring-slate-300 dark:hover:ring-slate-600";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
        <button onClick={onLess} className={btn} aria-label={`Moins de ${label.toLowerCase()}`}><Minus size={14} /></button>
        <span className="w-5 text-center text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">{value}</span>
        <button onClick={onMore} className={btn} aria-label={`Plus de ${label.toLowerCase()}`}><Plus size={14} /></button>
      </div>
    </div>
  );
}
