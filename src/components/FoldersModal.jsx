import { useMemo, useState } from "react";
import {
  Folder, FolderPlus, Pencil, Trash2, Check, X, ChevronUp, ChevronDown, Plus, Search,
} from "lucide-react";
import { Modal } from "./ui";
import {
  createFolder, renameFolder, deleteFolder, reorderFolders,
} from "../lib/folders";

/*
 * Deux modales pour les dossiers personnels (étiquettes) :
 *  - FoldersModal : gérer la liste (créer, renommer, réordonner, supprimer).
 *  - FolderPicker : cocher/décocher les dossiers d'un paquet (ou d'une sélection).
 *
 * Les opérations sur la LISTE (CRUD, ordre) appellent directement la lib : elles
 * ne dépendent que de l'uid. L'ASSIGNATION diffère selon la cible (un paquet ou
 * plusieurs), donc `FolderPicker` la délègue à `onToggle`, fourni par l'appelant.
 */

/* ------------------------------- Gestion ------------------------------- */

/* `ops` (facultatif) remplace les opérations sur les dossiers PERSO par d'autres
   — ceux d'un groupe, par exemple — avec la même interface ; `intro` et
   `footnote` adaptent les textes. Sans `ops`, ce sont les dossiers de `uid`.
   Sans `ops.reorder`, pas de flèches (ordre imposé par l'appelant).
   `canManage(folder)` masque renommer/supprimer sur les dossiers d'autrui. */
export function FoldersModal({ uid, folders, deckTags, onClose, ops, intro, footnote, canManage = () => true }) {
  const act = ops || {
    create: (n) => createFolder(uid, n),
    rename: (id, n) => renameFolder(uid, folders, id, n),
    reorder: (next) => reorderFolders(uid, next),
    remove: (id) => deleteFolder(uid, folders, deckTags, id),
  };
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmId, setConfirmId] = useState(null);   // dossier dont on confirme la suppression
  const [busy, setBusy] = useState(false);
  const [filtre, setFiltre] = useState("");           // recherche de dossier

  // Recherche insensible à la casse et aux accents.
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = norm(filtre).trim();
  const filtering = q.length > 0;
  const shown = useMemo(
    () => (filtering ? folders.filter((f) => norm(f.name).includes(q)) : folders),
    [folders, q, filtering],
  );

  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try { await act.create(n); setName(""); }
    catch (e) { console.error(e); alert("Création impossible. Réessayez."); }
    finally { setBusy(false); }
  };

  const rename = async (id) => {
    const n = renameVal.trim();
    if (!n) { setRenamingId(null); return; }
    try { await act.rename(id, n); }
    catch (e) { console.error(e); alert("Renommage impossible. Réessayez."); }
    setRenamingId(null);
  };

  // Réordonner par flèches (plus robuste qu'un glisser-déposer pour cette liste courte).
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= folders.length) return;
    const next = [...folders];
    [next[i], next[j]] = [next[j], next[i]];
    act.reorder(next).catch((e) => console.error(e));
  };

  const remove = async (id) => {
    try { await act.remove(id); }
    catch (e) { console.error(e); alert("Suppression impossible. Réessayez."); }
    setConfirmId(null);
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <Folder size={18} /> Dossiers
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-3 p-5">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {intro || (
            <>
              Les dossiers rangent <b>votre</b> liste d'accueil ; un paquet peut figurer dans
              plusieurs dossiers. Personnels et privés — sans rapport avec les groupes partagés.
            </>
          )}
        </p>

        {/* Créer */}
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="Nom d'un nouveau dossier"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            onClick={create}
            disabled={!name.trim() || busy}
            data-primary
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
          >
            <FolderPlus size={16} /> Créer
          </button>
        </div>

        {/* Recherche (dès qu'il y a quelques dossiers). */}
        {folders.length > 3 && (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              placeholder="Rechercher un dossier…"
              aria-label="Rechercher un dossier"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-9 text-slate-900 outline-none focus-visible:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {filtre && (
              <button onClick={() => setFiltre("")} aria-label="Effacer" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><X size={14} /></button>
            )}
          </div>
        )}

        {/* Liste */}
        {folders.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
            Aucun dossier pour l'instant.
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
            Aucun dossier ne correspond à « {filtre.trim()} ».
          </p>
        ) : (
          <div className="space-y-1.5">
            {shown.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                {/* Réordonner par flèches — masqué pendant une recherche (l'index
                    ne correspondrait plus à la liste complète). */}
                {!filtering && act.reorder && (
                  <div className="flex flex-col">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" className="text-slate-400 transition hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"><ChevronUp size={14} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === shown.length - 1} aria-label="Descendre" className="text-slate-400 transition hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"><ChevronDown size={14} /></button>
                  </div>
                )}
                <Folder size={16} className="shrink-0 text-violet-500" />

                {renamingId === f.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") rename(f.id); if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={() => rename(f.id)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">{f.name}</span>
                )}

                {confirmId === f.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Supprimer ?</span>
                    <button onClick={() => remove(f.id)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Oui</button>
                    <button onClick={() => setConfirmId(null)} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700">Non</button>
                  </div>
                ) : canManage(f) && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => { setRenamingId(f.id); setRenameVal(f.name); }} aria-label="Renommer" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"><Pencil size={15} /></button>
                    <button onClick={() => setConfirmId(f.id)} aria-label="Supprimer" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {footnote || "Supprimer un dossier retire seulement l'étiquette des paquets ; les paquets, eux, restent."}
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------ Assignation ---------------------------- */

/* Sélecteur de dossiers pour un paquet (ou une sélection). `isOn(id)` dit si la
   case est cochée, `onToggle(id, on)` applique le changement (single ou bulk).
   Un champ permet de créer un dossier à la volée sans quitter. */
export function FolderPicker({ uid, title, subtitle, folders, isOn, onToggle, onManage, onClose }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const id = await createFolder(uid, n);
      setName("");
      onToggle(id, true);   // le nouveau dossier est aussitôt appliqué à la cible
    } catch (e) { console.error(e); alert("Création impossible. Réessayez."); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Folder size={18} /> {title}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-3 p-5">
        {folders.length > 0 ? (
          <div className="space-y-1.5">
            {folders.map((f) => {
              const on = isOn(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => onToggle(f.id, !on)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition ${
                    on ? "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30"
                       : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600"
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${on ? "bg-violet-600 ring-violet-600 text-white" : "ring-slate-300 dark:ring-slate-600"}`}>
                    {on && <Check size={13} />}
                  </span>
                  <Folder size={15} className={on ? "text-violet-500" : "text-slate-400"} />
                  <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-5 text-center text-sm text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
            Aucun dossier. Créez-en un ci-dessous.
          </p>
        )}

        {/* Créer et appliquer aussitôt */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="Nouveau dossier…"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            onClick={create}
            disabled={!name.trim() || busy}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
          >
            <Plus size={16} /> Ajouter
          </button>
        </div>

        {onManage && (
          <button onClick={onManage} className="text-sm font-medium text-violet-600 transition hover:text-violet-700 dark:text-violet-400">
            Gérer les dossiers…
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ Filtre --------------------------------- */

/* Puce de filtre par dossier (accueil et vitrine d'un groupe). `folderId` sert
   de cible au glisser-déposer de l'accueil (data-folder-id). */
export function FolderChip({ label, count, active, onClick, icon, folderId, dragOver }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      data-folder-id={folderId}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
        dragOver
          ? "bg-violet-100 text-violet-800 ring-2 ring-violet-500 dark:bg-violet-500/20 dark:text-violet-100"
          : active
            ? "bg-violet-600 text-white ring-violet-600"
            : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600"
      }`}
    >
      {icon && <Folder size={13} className={dragOver ? "text-violet-600" : active ? "text-white" : "text-violet-500"} />}
      <span className="max-w-[10rem] truncate">{label}</span>
      <span className={active && !dragOver ? "text-violet-200" : "text-slate-400 dark:text-slate-500"}>{count}</span>
    </button>
  );
}
