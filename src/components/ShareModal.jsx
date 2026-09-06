import { useEffect, useState } from "react";
import { Users, Check, Copy, Lock, Unlock, Loader2, Plus } from "lucide-react";
import { Modal } from "./ui";
import { setMembersCanEdit } from "../lib/decks";
import { publishedDeckIds, publishDeck, unpublishDeck } from "../lib/groups";

/* Modale de partage d'un paquet : code à communiquer, droit d'édition (réglable
   par le propriétaire), et publication dans un groupe. Réutilisée depuis la vue
   d'un paquet ET depuis le menu « ⋮ » de la liste d'accueil. */
export default function ShareModal({ deck, uid, groups, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(deck.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  const isOwner = deck.owner === uid;
  const open = deck.membersCanEdit === true;

  return (
    <Modal onClose={onClose}>
      <div className="modal-body soft-scroll p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"><Users size={18} /></span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Partager le paquet</h2>
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Communiquez ce code aux membres du groupe. Ils pourront réviser le paquet et suivre leur propre progression.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-2 pl-4">
          <span className="flex-1 font-mono text-xl font-bold tracking-widest text-slate-800 dark:text-slate-200">{deck.code}</span>
          <button onClick={copy} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
            {copied ? <><Check size={15} /> Copié</> : <><Copy size={15} /> Copier</>}
          </button>
        </div>

        {/* Droit d'édition : réglable par le propriétaire, seulement consultable par les autres. */}
        <div className={`mt-4 rounded-xl p-3.5 ring-1 ${open ? "bg-amber-50 dark:bg-amber-500/10 ring-amber-200 dark:ring-amber-500/30" : "bg-slate-50 dark:bg-slate-800/60 ring-slate-200 dark:ring-slate-700"}`}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 shrink-0 ${open ? "text-amber-600" : "text-slate-400 dark:text-slate-500"}`}>
              {open ? <Unlock size={18} /> : <Lock size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {open ? "Les membres peuvent modifier ce paquet" : "Les membres ne peuvent pas modifier ce paquet"}
              </p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {open
                  ? "Ceux qui ont le code peuvent ajouter, modifier, réordonner et supprimer des cartes."
                  : "Ceux qui ont le code peuvent réviser, mais vous seul modifiez les cartes."}
              </p>
            </div>
            {isOwner && (
              <button
                onClick={() => setMembersCanEdit(deck.id, !open)}
                role="switch"
                aria-checked={open}
                aria-label="Autoriser les membres à modifier le paquet"
                className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${open ? "bg-amber-500" : "bg-slate-300"}`}
              >
                <span className={`h-5 w-5 rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${open ? "translate-x-5" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Publier dans un groupe : réservé au propriétaire du paquet. */}
        {isOwner && groups && groups.length > 0 && <PublishSection deck={deck} groups={groups} />}
      </div>
    </Modal>
  );
}

/* Cases pour publier/retirer le paquet dans chacun des groupes de l'utilisateur.
   L'état publié est lu une fois à l'ouverture, puis maintenu localement. */
function PublishSection({ deck, groups }) {
  const [published, setPublished] = useState(null);   // Set des groupIds où le paquet est publié
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const set = new Set();
      await Promise.all(groups.map(async (g) => {
        const ids = await publishedDeckIds(g.id).catch(() => new Set());
        if (ids.has(deck.id)) set.add(g.id);
      }));
      if (vivant) setPublished(set);
    })();
    return () => { vivant = false; };
  }, [deck.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (g) => {
    if (!published) return;
    const on = published.has(g.id);
    setBusy(g.id);
    try {
      if (on) await unpublishDeck(g.id, deck.id);
      else await publishDeck(g.id, deck, deck.owner);
      setPublished((s) => { const n = new Set(s); on ? n.delete(g.id) : n.add(g.id); return n; });
    } catch (e) { console.error(e); alert("Opération impossible. Réessayez."); }
    finally { setBusy(null); }
  };

  return (
    <div className="mt-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Publier dans un groupe</span>
      <div className="mt-1.5 space-y-1.5">
        {groups.map((g) => {
          const on = published?.has(g.id);
          return (
            <button
              key={g.id}
              onClick={() => toggle(g)}
              disabled={published === null || busy === g.id}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 transition disabled:opacity-60 ${
                on ? "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30"
                   : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600"
              }`}
            >
              <Users size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left font-medium">{g.name}</span>
              {busy === g.id ? <Loader2 size={15} className="animate-spin" />
                : on ? <Check size={15} className="text-violet-600 dark:text-violet-300" />
                : <Plus size={15} className="text-slate-400" />}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
        Un paquet publié apparaît dans le catalogue du groupe ; ses membres peuvent le rejoindre.
      </p>
    </div>
  );
}
