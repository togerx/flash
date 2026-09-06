import { useEffect, useRef, useState } from "react";
import {
  Users, Share2, Check, Copy, Plus, LogOut, Trash2, Loader2, Sparkles, X, Eye, Crown,
} from "lucide-react";
import { Shell, Header, Modal, IconBtn, ConfirmModal, useBack } from "./ui";
import {
  watchCatalog, renameGroup, leaveGroup, deleteGroup, markGroupSeen, groupSeenAt,
} from "../lib/groups";
import { joinDeck } from "../lib/decks";

/*
 * Vitrine d'un groupe : la liste des paquets qui y sont publiés. On rejoint
 * ceux qu'on veut ; ceux déjà rejoints sont signalés. Les paquets ajoutés
 * depuis la dernière visite portent un badge « nouveau ».
 */
export default function GroupView({ group, uid, pseudo, myDeckIds, onBack, onOpenDeck }) {
  const [catalog, setCatalog] = useState(null);
  const [share, setShare] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [joining, setJoining] = useState(null);
  const [membersOpen, setMembersOpen] = useState(false);

  useBack(onBack);   // balayage à deux doigts = revenir à l'accueil

  // Seuil « nouveau » figé à l'entrée, avant de marquer le groupe comme vu.
  const seuil = useRef(groupSeenAt(group.id));
  useEffect(() => watchCatalog(group.id, setCatalog), [group.id]);
  useEffect(() => { markGroupSeen(group.id); }, [group.id]);

  const isOwner = group.owner === uid;

  const rejoindre = async (entry) => {
    setJoining(entry.deckId);
    try { await joinDeck(entry.deckId, uid, pseudo); }
    catch (e) { console.error(e); alert("Impossible de rejoindre ce paquet. Réessayez."); }
    finally { setJoining(null); }
  };

  // Voir = ouvrir le paquet sans le rejoindre. La lecture d'un paquet publié
  // dans le groupe est autorisée aux membres du groupe (voir les règles).
  const voir = (entry) => onOpenDeck(entry.deckId);

  const estNouveau = (entry) => (entry.addedAt?.toMillis?.() ?? 0) > seuil.current;

  return (
    <Shell>
      <Header
        home
        onHome={onBack}
        title={group.name}
        subtitle={`Groupe · ${(group.members || []).length} membre${(group.members || []).length > 1 ? "s" : ""}`}
        right={
          <button onClick={() => setShare(true)} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600">
            <Share2 size={15} /> Inviter
          </button>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMembersOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600"
        >
          <Users size={16} /> {(group.members || []).length} membre{(group.members || []).length > 1 ? "s" : ""}
        </button>
        {isOwner ? (
          <button onClick={() => setConfirmDelete(true)} className="ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-red-400">
            <Trash2 size={16} /> Supprimer le groupe
          </button>
        ) : (
          <button onClick={() => setConfirmLeave(true)} className="ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-red-400">
            <LogOut size={16} /> Quitter le groupe
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2.5">
        {catalog === null && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 py-12 text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
            <Loader2 size={18} className="animate-spin" /> <span className="text-sm font-medium">Chargement du catalogue…</span>
          </div>
        )}
        {catalog?.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 py-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <p className="font-medium text-slate-700 dark:text-slate-300">Aucun paquet publié</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Publiez un de vos paquets depuis son bouton « Partager », onglet groupe.
            </p>
          </div>
        )}
        {catalog?.map((entry) => {
          const dejaMembre = myDeckIds.has(entry.deckId);
          return (
            <div key={entry.deckId} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">{entry.name}</p>
                  {estNouveau(entry) && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                      <Sparkles size={11} /> Nouveau
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  par {entry.ownerPseudo || "?"} · {entry.cardCount || 0} carte{(entry.cardCount || 0) > 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => voir(entry)}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  <Eye size={15} /> Voir
                </button>
                {/* « Rejoindre » disparaît une fois le paquet dans mes paquets. */}
                {!dejaMembre && (
                  <button
                    onClick={() => rejoindre(entry)}
                    disabled={joining === entry.deckId}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Plus size={15} /> Rejoindre
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {share && <GroupShareModal group={group} onClose={() => setShare(false)} />}
      {membersOpen && <GroupMembersModal group={group} uid={uid} onClose={() => setMembersOpen(false)} />}
      {confirmLeave && (
        <ConfirmModal
          title="Quitter le groupe ?"
          body="Vous ne verrez plus son catalogue. Les paquets déjà rejoints restent dans vos paquets."
          confirmLabel="Quitter le groupe"
          busyLabel="Sortie…"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={async () => { await leaveGroup(group.id, uid); onBack(); }}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title={`Supprimer « ${group.name} » ?`}
          body="Le groupe et son catalogue disparaissent pour tous les membres. Les paquets eux-mêmes ne sont pas supprimés."
          confirmLabel="Supprimer le groupe"
          busyLabel="Suppression…"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => { await deleteGroup(group); onBack(); }}
        />
      )}
    </Shell>
  );
}

/* Liste des membres du groupe : pseudo, avec le propriétaire en tête et un
   repère « Vous » pour l'utilisateur courant. Les pseudos viennent de la table
   `pseudos` du groupe (chacun n'écrit que le sien). */
function GroupMembersModal({ group, uid, onClose }) {
  const members = group.members || [];
  const nameOf = (id) =>
    group.pseudos?.[id] || (id === group.owner ? group.ownerPseudo : "") || "Membre";
  // Propriétaire d'abord, puis les autres par ordre alphabétique de pseudo.
  const ordre = [...members].sort((a, b) => {
    if (a === group.owner) return -1;
    if (b === group.owner) return 1;
    return nameOf(a).localeCompare(nameOf(b), "fr");
  });

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <Users size={18} /> Membres · {members.length}
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll p-3">
        <ul className="space-y-1">
          {ordre.map((id) => {
            const nom = nameOf(id);
            const estProprio = id === group.owner;
            const estMoi = id === uid;
            return (
              <li key={id} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                  {nom[0]?.toUpperCase() || "?"}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">
                  {nom}{estMoi && <span className="text-slate-400 dark:text-slate-500"> · vous</span>}
                </span>
                {estProprio && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    <Crown size={11} /> Propriétaire
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

function GroupShareModal({ group, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(group.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  return (
    <Modal onClose={onClose}>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"><Users size={18} /></span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inviter dans le groupe</h2>
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Communiquez ce code. Les membres verront le catalogue et rejoindront les paquets de leur choix.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pl-4 dark:border-slate-700 dark:bg-slate-800/60">
          <span className="flex-1 font-mono text-xl font-bold tracking-widest text-slate-800 dark:text-slate-100">{group.code}</span>
          <button onClick={copy} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600">
            {copied ? <><Check size={15} /> Copié</> : <><Copy size={15} /> Copier</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
