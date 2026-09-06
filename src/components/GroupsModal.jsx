import { useState } from "react";
import { X, Plus, LogIn, Users, Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { Modal } from "./ui";
import { groupHasNews } from "../lib/groups";

/*
 * Gestion des groupes : liste de ceux qu'on a rejoints (avec un repère quand un
 * paquet y a été publié depuis la dernière visite), création, et jonction par
 * code. Ouvrir un groupe affiche sa vitrine (GroupView).
 */
export default function GroupsModal({ groups, onOpen, onCreate, onJoin, onClose }) {
  const [mode, setMode] = useState(null);   // "create" | "join"
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true); setErr("");
    try {
      if (mode === "create") await onCreate(v);
      else await onJoin(v);
      setValue(""); setMode(null);
    } catch (e) {
      // Le message brut de Firebase (« Missing or insufficient permissions »)
      // ne parle pas à l'utilisateur : on le remplace.
      setErr(e?.code === "permission-denied"
        ? "Fonction indisponible pour le moment. Réessayez plus tard."
        : (e?.message?.includes("permission") ? "Fonction indisponible pour le moment. Réessayez plus tard." : (e?.message || "Opération impossible.")));
    } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <Users size={18} /> Groupes
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-3 p-5">
        {groups.length === 0 && !mode && (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700">
            Un groupe rassemble des paquets partagés. Créez-en un, ou rejoignez celui d'un collègue avec son code.
          </p>
        )}

        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => onOpen(g.id)}
            className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-700 dark:hover:ring-slate-600"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300"><Users size={18} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">{g.name}</p>
                {groupHasNews(g) && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                    <Sparkles size={11} /> Nouveau
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{g.deckCount || 0} paquet{(g.deckCount || 0) > 1 ? "s" : ""} · {(g.members || []).length} membre{(g.members || []).length > 1 ? "s" : ""}</p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-slate-400" />
          </button>
        ))}

        {mode && (
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={mode === "create" ? "Nom du groupe" : "Code du groupe"}
              className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 ${mode === "join" ? "font-mono uppercase tracking-widest" : ""}`}
            />
            {err && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{err}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => { setMode(null); setErr(""); setValue(""); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Annuler</button>
              <button onClick={submit} disabled={!value.trim() || busy} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40">
                {busy && <Loader2 size={14} className="animate-spin" />} {mode === "create" ? "Créer" : "Rejoindre"}
              </button>
            </div>
          </div>
        )}
      </div>

      {!mode && (
        <div className="flex shrink-0 gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button onClick={() => setMode("create")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700">
            <Plus size={17} /> Créer un groupe
          </button>
          <button onClick={() => setMode("join")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600">
            <LogIn size={17} /> Rejoindre
          </button>
        </div>
      )}
    </Modal>
  );
}
