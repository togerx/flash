import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Plus, Trash2, Pencil, Share2, Play, Image as ImageIcon, X, Check,
  Users, Copy, GripVertical, Circle, RotateCcw, Lock, Unlock, Loader2, WifiOff,
  List, ListOrdered, Table, Search, CheckSquare, Square, FolderPlus, Sparkles, Eye,
  ChevronDown, ChevronUp, ChevronsUpDown, ChevronsDownUp,
} from "lucide-react";
import { Shell, Header, Modal, IconBtn, ConfirmModal, Loading, useBack } from "./ui";
import CropModal from "./CropModal";
import TableModal from "./TableModal";
import DeckProgress from "./DeckProgress";
import RichText, { plainPreview, hasStructure } from "./RichText";
import Review from "./Review";
import GuidedReview from "./GuidedReview";
import { aReviser } from "../lib/srs";
import {
  watchCards, newCardId, addCard, updateCard, deleteCard, deleteCards, reorderCards,
  setCardLearned, learnState, matchesFilter, statsFromCards, repairDeckStats, resetProgress,
  canEditDeck,
} from "../lib/decks";
import { uploadImage, deleteImageByPath } from "../lib/image";
import { useOnline } from "../lib/online";
import { continueList } from "../lib/listInput";
import { markReviewed } from "../lib/deckMeta";
import ShareModal from "./ShareModal";

export default function DeckView({ deck, uid, pseudo, groups = [], isMember = true, onJoinDeck, onBack, onExportSelection, startGuided, onGuidedStarted }) {
  const [cards, setCards] = useState([]);
  const [editor, setEditor] = useState(null);       // { card | null }
  const [share, setShare] = useState(false);
  const [setup, setSetup] = useState(false);
  const [review, setReview] = useState(null);        // config de la série en cours
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragList, setDragList] = useState(null);   // aperçu local pendant le glissement
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDelSel, setConfirmDelSel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [guided, setGuided] = useState(null);        // config de la séance guidée
  const [guidedSetup, setGuidedSetup] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());   // cartes dépliées (contenu complet)

  // Balayage à deux doigts vers la droite : revenir à l'accueil (les révisions et
  // modales, montées par-dessus, interceptent d'abord — voir useBack).
  useBack(onBack);

  // Date de dernière révision (tri de l'accueil) : dès qu'une séance démarre.
  useEffect(() => { if (review || guided) markReviewed(deck.id); }, [review, guided, deck.id]);

  // `loading` court jusqu'au premier instantané : sans lui, l'écran annoncerait
  // « Aucune carte » le temps que Firestore réponde.
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(true);
  useEffect(() => {
    setLoading(true);
    return watchCards(deck.id, (c, meta) => {
      setCards(c); setLoading(false); setFromCache(meta.fromCache);
    });
  }, [deck.id]);

  // Les cartes sont de toute façon lues ici : on en profite pour remettre d'aplomb
  // les compteurs du paquet s'ils ont dérivé (une seule fois par ouverture).
  // Jamais depuis le cache : un instantané local peut être incomplet, et la
  // « réparation » écrirait alors des compteurs faux.
  const repaired = useRef(false);
  useEffect(() => {
    // En aperçu (non-membre), l'écriture des compteurs est refusée : on n'essaie pas.
    if (!isMember || repaired.current || !cards.length || fromCache) return;
    repaired.current = true;
    repairDeckStats(deck.id, deck, cards, uid).catch(() => {});
  }, [cards, fromCache]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Raccourci depuis la liste des paquets : la séance démarre dès que les
     cartes sont là, avec les réglages recommandés (une seule fois). */
  const guidedLance = useRef(false);
  useEffect(() => {
    if (!startGuided || loading || guidedLance.current) return;
    guidedLance.current = true;
    setGuided({ direction: "recto-verso", count: 10 });
    onGuidedStarted?.();
  }, [startGuided, loading]);   // eslint-disable-line react-hooks/exhaustive-deps

  // L'aperçu local reste affiché jusqu'à ce que Firestore renvoie le même ordre :
  // évite que la liste ne saute entre le lâcher et l'aller-retour serveur.
  const ids = (l) => l.map((c) => c.id).join();
  useEffect(() => {
    if (dragList && ids(dragList) === ids(cards)) setDragList(null);
  }, [cards]);   // eslint-disable-line react-hooks/exhaustive-deps

  const list = dragList || cards;
  // Un non-membre ne peut rien éditer, quels que soient les droits du paquet.
  const canEdit = isMember && canEditDeck(deck, uid);
  const [joining, setJoining] = useState(false);
  const join = async () => {
    setJoining(true);
    try { await onJoinDeck?.(); }
    catch (e) { console.error(e); alert("Impossible de rejoindre. Réessayez."); setJoining(false); }
  };

  /* Recherche : insensible à la casse et aux accents, et menée sur le texte
     débarrassé de son balisage, pour qu'un mot dans une cellule de tableau
     ressorte comme les autres. */
  const norm = (s) => plainPreview(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = norm(search).trim();
  const shown = q ? cards.filter((c) => norm(c.rectoText).includes(q) || norm(c.versoText).includes(q)) : list;

  // Numéro réel dans le paquet : pendant une recherche, l'index de la liste
  // affichée ne veut plus rien dire, alors que ce numéro sert de repère (plage
  // de révision, échange entre membres).
  const numero = new Map(cards.map((c, i) => [c.id, i + 1]));
  // Réordonner une liste filtrée écrirait des positions calculées sur un
  // sous-ensemble : le glissement est suspendu pendant une recherche, et n'a
  // pas de sens non plus quand on coche des cartes.
  const canDrag = canEdit && !q && !selecting;

  /* Sélection : les cartes cochées limitent la prochaine série. Les boutons
     « Tout » et « Aucune » portent sur les cartes AFFICHÉES, donc sur les
     résultats quand une recherche est en cours — c'est ce qui permet de
     composer une série rapidement (chercher un thème, tout cocher). */
  const startSelect = () => { setSelected(new Set(cards.map((c) => c.id))); setSelecting(true); };
  const toggleOne = (id) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const checkShown = (on) =>
    setSelected((s) => {
      const n = new Set(s);
      shown.forEach((c) => (on ? n.add(c.id) : n.delete(c.id)));
      return n;
    });

  // Un id supprimé entre-temps ne doit pas compter.
  const pool = selecting ? cards.filter((c) => selected.has(c.id)) : cards;
  const nbSelected = pool.length;
  // État des cartes affichées, pour savoir ce que le bouton unique doit proposer.
  const toutCoche = shown.length > 0 && shown.every((c) => selected.has(c.id));

  /* Dépli du contenu : une carte dépliée montre son recto/verso en entier
     (RichText, image agrandie) au lieu de l'aperçu tronqué. Le bouton global
     porte, comme la sélection, sur les cartes AFFICHÉES (donc les résultats
     pendant une recherche). */
  const allExpanded = shown.length > 0 && shown.every((c) => expandedIds.has(c.id));
  const toggleOneExpand = (id) =>
    setExpandedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllExpand = () =>
    setExpandedIds((s) => {
      const n = new Set(s);
      shown.forEach((c) => (allExpanded ? n.delete(c.id) : n.add(c.id)));
      return n;
    });
  const du = aReviser(cards, uid);   // ce que la révision guidée propose maintenant
  const selBtn = "flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:ring-slate-300 disabled:opacity-40 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600";

  const startDrag = (id, e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDragId(id); };

  const onDragMove = (e) => {
    if (!dragId) return;
    const overId = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-card-id]")?.dataset.cardId;
    if (!overId || overId === dragId) return;
    setDragList((prev) => {
      const arr = [...(prev || cards)];
      const from = arr.findIndex((c) => c.id === dragId);
      const to = arr.findIndex((c) => c.id === overId);
      if (from < 0 || to < 0) return prev;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      return arr;
    });
  };

  const onDragEnd = () => {
    if (!dragId) return;
    setDragId(null);
    if (dragList && ids(dragList) !== ids(cards)) reorderCards(deck.id, dragList).catch(() => setDragList(null));
    else setDragList(null);
  };

  // Éditer une carte directement pendant une révision : l'éditeur s'ouvre par
  // dessus la séance, et la carte se met à jour en direct (watchCards) sans
  // interrompre le déroulé. Réservé à ceux qui peuvent éditer le contenu.
  const editInReview = canEdit ? (c) => setEditor({ card: c }) : undefined;

  if (guided) {
    return (
      <>
        <GuidedReview
          deck={deck} cards={cards} uid={uid} config={guided}
          onExit={() => setGuided(null)}
          onHome={() => { setGuided(null); onBack(); }}
          onEdit={editInReview}
          editing={!!editor}
        />
        {editor && <CardEditor deckId={deck.id} card={editor.card} onClose={() => setEditor(null)} />}
      </>
    );
  }

  if (review) {
    return (
      <>
        <Review
          deck={deck} cards={cards} uid={uid} config={review}
          onExit={() => setReview(null)}
          onHome={() => { setReview(null); onBack(); }}
          onNewSeries={() => { setReview(null); setSetup(true); }}
          onEdit={editInReview}
          editing={!!editor}
        />
        {editor && <CardEditor deckId={deck.id} card={editor.card} onClose={() => setEditor(null)} />}
      </>
    );
  }


  return (
    <Shell>
      <Header
        title={deck.name}
        subtitle={loading ? "Chargement…" : `${cards.length} carte${cards.length > 1 ? "s" : ""}${canEdit ? "" : " · lecture seule"}`}
        home
        onHome={onBack}
        right={<button onClick={() => setShare(true)} className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-slate-300 dark:hover:ring-slate-600"><Share2 size={15} /> Partager</button>}
      />

      {!isMember && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 px-3.5 py-3 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/30">
          <Eye size={18} className="shrink-0 text-violet-600 dark:text-violet-300" />
          <p className="min-w-0 flex-1 text-sm text-violet-800 dark:text-violet-200">
            Aperçu depuis un groupe. Rejoignez le paquet pour l'ajouter à vos paquets et enregistrer votre progression.
          </p>
          <button
            onClick={join}
            disabled={joining}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {joining ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Rejoindre
          </button>
        </div>
      )}

      <DeckProgress stats={statsFromCards(cards, uid)} />

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => nbSelected && setSetup(true)}
          disabled={!nbSelected}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play size={17} /> Réviser{selecting ? ` (${nbSelected})` : ""}
        </button>

        {cards.length > 0 && !selecting && (
          <button
            onClick={() => setGuidedSetup(true)}
            title="Révision espacée : chaque carte revient à l'échéance calculée pour vous"
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600"
          >
            <Sparkles size={17} /> Guidée
            {du.total > 0 && (
              <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-xs font-bold text-white">{du.total}</span>
            )}
          </button>
        )}

        {cards.length > 0 && (
          <button
            onClick={() => (selecting ? setSelecting(false) : startSelect())}
            title={selecting ? "Quitter la sélection" : "Choisir les cartes à réviser"}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold shadow-sm ring-1 transition ${
              selecting
                ? "bg-violet-600 text-white ring-violet-600 hover:bg-violet-700"
                : "bg-white text-slate-800 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600"
            }`}
          >
            <CheckSquare size={17} /> {selecting ? "Terminer" : "Sélectionner"}
          </button>
        )}
        {canEdit && (
          <button onClick={() => setEditor({ card: null })} className="flex items-center gap-2 rounded-xl bg-white dark:bg-slate-900 px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:ring-slate-300 dark:hover:ring-slate-600">
            <Plus size={17} /> Ajouter une carte
          </button>
        )}
        {cards.length > 0 && (
          <div className="relative min-w-[180px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans les cartes…"
              aria-label="Rechercher dans les cartes"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {cards.length > 0 && (
          <button
            onClick={() => setConfirmReset(true)}
            title="Remettre toutes les cartes à « pas encore vue »"
            className="ml-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 transition hover:bg-white dark:hover:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <RotateCcw size={16} /> Réinitialiser ma progression
          </button>
        )}
      </div>

      {selecting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/30">
          <span className="text-sm font-medium text-violet-800 dark:text-violet-200">
            {nbSelected} carte{nbSelected > 1 ? "s" : ""} sélectionnée{nbSelected > 1 ? "s" : ""}
            {q ? " · recherche en cours" : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {/* Un seul bouton : il propose l'action inverse de l'état courant
                des cartes affichées. */}
            <button onClick={() => checkShown(!toutCoche)} className={selBtn}>
              {toutCoche ? <Square size={15} /> : <CheckSquare size={15} />}
              {toutCoche ? "Tout décocher" : "Tout cocher"}
            </button>
            <button onClick={() => setExporting(true)} disabled={!nbSelected} className={selBtn}>
              <FolderPlus size={15} /> Exporter
            </button>
            {canEdit && (
              <button
                onClick={() => setConfirmDelSel(true)}
                disabled={!nbSelected}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-40 dark:bg-slate-900 dark:text-red-300 dark:ring-red-500/30 dark:hover:bg-red-500/10"
              >
                <Trash2 size={15} /> Supprimer
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {!loading && shown.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={toggleAllExpand}
              title={allExpanded ? "Réduire toutes les cartes" : "Voir tout le contenu de chaque carte"}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            >
              {allExpanded ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
              {allExpanded ? "Tout réduire" : "Tout étendre"}
            </button>
          </div>
        )}
        {loading && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50">
            <Loading label="Chargement des cartes…" />
          </div>
        )}
        {!loading && cards.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 py-12 text-center">
            <p className="font-medium text-slate-700 dark:text-slate-300">Aucune carte pour l'instant</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {canEdit ? "Ajoutez votre première carte pour lancer une révision." : "Le propriétaire n'a pas encore ajouté de carte."}
            </p>
          </div>
        )}
        {q && shown.length === 0 && !loading && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 py-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <p className="font-medium text-slate-700 dark:text-slate-300">Aucun résultat</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Aucune carte ne contient « {search.trim()} ».</p>
          </div>
        )}
        {shown.map((c) => (
          <CardRow
            key={c.id}
            card={c}
            numero={numero.get(c.id)}
            selecting={selecting}
            selected={selected.has(c.id)}
            onToggleSelect={() => toggleOne(c.id)}
            canDrag={canDrag}
            dragId={dragId}
            onStartDrag={startDrag}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            uid={uid}
            onSetLearned={(v) => setCardLearned(deck.id, c, uid, v)}
            canEdit={canEdit}
            onEdit={() => setEditor({ card: c })}
            onDelete={() => setConfirmDel(c)}
            expanded={expandedIds.has(c.id)}
            onToggleExpand={() => toggleOneExpand(c.id)}
          />
        ))}

        {q && shown.length > 0 && (
          <p className="pt-1 text-center text-sm text-slate-500 dark:text-slate-400">
            {shown.length} carte{shown.length > 1 ? "s" : ""} sur {cards.length}
          </p>
        )}
      </div>

      {editor && <CardEditor deckId={deck.id} card={editor.card} onClose={() => setEditor(null)} />}
      {share && <ShareModal deck={deck} uid={uid} groups={groups} onClose={() => setShare(false)} />}
      {guidedSetup && (
        <GuidedModal
          du={du}
          onClose={() => setGuidedSetup(false)}
          onStart={(cfg) => { setGuidedSetup(false); setGuided(cfg); }}
        />
      )}

      {setup && (
        <SessionModal
          cards={pool}
          uid={uid}
          restreint={selecting}
          onClose={() => setSetup(false)}
          onStart={(cfg) => {
            setSetup(false);
            // Avec une sélection active, la série se limite à ces cartes : les
            // ids voyagent avec la configuration jusqu'à buildSeries.
            setReview({ ...cfg, ids: selecting ? pool.map((c) => c.id) : null });
          }}
        />
      )}
      {confirmDelSel && (
        <ConfirmModal
          title={`Supprimer ${nbSelected} carte${nbSelected > 1 ? "s" : ""} ?`}
          body={
            `${nbSelected} carte${nbSelected > 1 ? "s seront retirées" : " sera retirée"} définitivement du paquet, ` +
            `avec leur${nbSelected > 1 ? "s" : ""} image${nbSelected > 1 ? "s" : ""}.\n\n` +
            `La suppression vaut pour tous les membres du paquet.`
          }
          confirmLabel={`Supprimer ${nbSelected} carte${nbSelected > 1 ? "s" : ""}`}
          onCancel={() => setConfirmDelSel(false)}
          busyLabel="Suppression…"
          onConfirm={async () => {
            await deleteCards(deck.id, pool);
            setConfirmDelSel(false);
            setSelecting(false);
          }}
        />
      )}

      {exporting && (
        <ExportModal
          defaultName={`${deck.name} (sélection)`}
          count={nbSelected}
          onClose={() => setExporting(false)}
          onExport={async (name) => {
            await onExportSelection(name, pool.map((c) => c.id));
            setExporting(false);
            setSelecting(false);
          }}
        />
      )}

      {confirmReset && (
        <ConfirmModal
          title="Réinitialiser votre progression ?"
          body="Toutes les cartes de ce paquet redeviendront « pas encore vues ». Cela ne concerne que votre suivi : celui des autres membres n'est pas touché."
          confirmLabel="Réinitialiser"
          onCancel={() => setConfirmReset(false)}
          busyLabel="Réinitialisation…"
          onConfirm={async () => { await resetProgress(deck.id, cards, uid); setConfirmReset(false); }}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          title="Supprimer cette carte ?"
          body="La carte et ses images seront retirées du paquet."
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { await deleteCard(deck.id, confirmDel.id, confirmDel); setConfirmDel(null); }}
        />
      )}
    </Shell>
  );
}

/* État d'apprentissage d'une carte, propre à l'utilisateur. Un clic fait le tour
   des trois états : pas encore vue → apprise → à revoir → pas encore vue. */
const CYCLE = {
  nonvue:  { next: true,  icon: Circle, cls: "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300", title: "Pas encore vue — cliquer pour marquer apprise" },
  apprise: { next: false, icon: Check,  cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/30",                title: "Apprise — cliquer pour marquer à revoir" },
  arevoir: { next: null,  icon: X,      cls: "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-500/30",                         title: "À revoir — cliquer pour remettre « pas encore vue »" },
};

function LearnedBtn({ card, uid, onSet }) {
  const state = learnState(card, uid);
  const { next, icon: Icon, cls, title } = CYCLE[state];
  return (
    <button
      onClick={() => onSet(next)}
      aria-label={title}
      title={title}
      className={`flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full transition ${cls}`}
    >
      <Icon size={16} />
    </button>
  );
}

function FacePreview({ label, text, img, pRef }) {
  return (
    <div className="min-w-0 flex-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <div className="mt-0.5 flex items-center gap-2">
        {img && <img src={img} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-slate-200 dark:ring-slate-700" />}
        {/* `pRef` sert à la ligne parente pour détecter si le texte est tronqué
            (scrollWidth > clientWidth) et n'afficher le bouton « étendre » que
            dans ce cas. */}
        <p ref={pRef} className="truncate text-sm text-slate-700 dark:text-slate-300">{plainPreview(text) || <span className="text-slate-300 dark:text-slate-600">—</span>}</p>
      </div>
    </div>
  );
}

/* Une face en entier (carte dépliée) : image agrandie puis contenu complet rendu
   par RichText (listes, tableaux, retours à la ligne conservés). */
function FaceFull({ label, text, img }) {
  return (
    <div className="min-w-0 flex-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <div className="mt-1 flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
        {img && <img src={img} alt="" className="max-h-48 w-auto max-w-full self-start rounded-lg object-contain ring-1 ring-slate-200 dark:ring-slate-700" />}
        {text?.trim() ? <RichText text={text} /> : <span className="text-slate-300 dark:text-slate-600">—</span>}
      </div>
    </div>
  );
}

/* Ligne d'une carte dans la liste du paquet. Repliée : aperçu tronqué recto |
   verso. Dépliée : contenu complet, recto puis verso. Le bouton d'expansion
   n'apparaît que si l'aperçu est réellement tronqué (mesure à la mise en page),
   ou tant que la carte est dépliée (pour pouvoir la replier). */
function CardRow({
  card, numero, selecting, selected, onToggleSelect,
  canDrag, dragId, onStartDrag, onDragMove, onDragEnd,
  uid, onSetLearned, canEdit, onEdit, onDelete,
  expanded, onToggleExpand,
}) {
  const rectoRef = useRef(null);
  const versoRef = useRef(null);
  const [truncated, setTruncated] = useState(false);

  // Mesure de la troncature (repliée uniquement). Recalculée si le contenu, la
  // largeur (redimensionnement) ou les colonnes latérales (case/poignée) changent.
  useLayoutEffect(() => {
    if (expanded) return undefined;
    const over = (el) => !!el && el.scrollWidth > el.clientWidth + 1;
    const check = () => setTruncated(over(rectoRef.current) || over(versoRef.current));
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [expanded, selecting, canDrag, card.rectoText, card.versoText, card.rectoImgUrl, card.versoImgUrl]);

  const showToggle = expanded || truncated;

  return (
    <div
      data-card-id={card.id}
      onClick={selecting ? onToggleSelect : undefined}
      className={`flex items-stretch gap-2 rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-sm ring-1 transition-shadow ${
        selecting ? "cursor-pointer" : ""
      } ${
        dragId === card.id ? "ring-2 ring-violet-400 shadow-lg"
          : selecting && selected ? "ring-2 ring-violet-400 dark:ring-violet-500"
          : "ring-slate-200 dark:ring-slate-700"
      } ${selecting && !selected ? "opacity-55" : ""}`}
    >
      {selecting && (
        // La ligne entière bascule la case : viser un carré de 16 px au doigt
        // serait pénible sur une longue liste.
        <span className="flex w-6 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Sélectionner la carte ${numero}`}
            className="h-4 w-4 accent-violet-600"
          />
        </span>
      )}
      {canDrag && (
        <button
          onPointerDown={(e) => onStartDrag(card.id, e)}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          aria-label="Déplacer la carte"
          title="Glisser pour réordonner"
          className="flex w-6 shrink-0 touch-none cursor-grab items-center justify-center text-slate-300 dark:text-slate-600 transition hover:text-slate-500 dark:hover:text-slate-400 active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </button>
      )}
      <span className="flex w-5 shrink-0 items-center justify-center text-sm font-semibold text-slate-400 dark:text-slate-500">{numero}</span>

      {expanded ? (
        <div className="min-w-0 flex-1 space-y-3 py-0.5">
          <FaceFull label="Recto" text={card.rectoText} img={card.rectoImgUrl} />
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <FaceFull label="Verso" text={card.versoText} img={card.versoImgUrl} />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-stretch gap-2">
          <FacePreview label="Recto" text={card.rectoText} img={card.rectoImgUrl} pRef={rectoRef} />
          <div className="w-px shrink-0 bg-slate-100 dark:bg-slate-800" />
          <FacePreview label="Verso" text={card.versoText} img={card.versoImgUrl} pRef={versoRef} />
        </div>
      )}

      {/* Emplacement du chevron TOUJOURS réservé (bouton présent seulement si
          utile) : sans cette largeur fixe, les cartes tronquées seraient plus
          étroites que les autres et leur séparateur recto|verso se décalerait. */}
      <div className="flex w-8 shrink-0 items-center justify-center self-center">
        {showToggle && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            aria-label={expanded ? "Réduire la carte" : "Étendre la carte"}
            aria-expanded={expanded}
            title={expanded ? "Réduire" : "Voir tout le contenu"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      <LearnedBtn card={card} uid={uid} onSet={onSetLearned} />
      {canEdit && (
        <div className="flex shrink-0 flex-col justify-center gap-1">
          <IconBtn label="Modifier" onClick={onEdit}><Pencil size={16} /></IconBtn>
          <IconBtn label="Supprimer" danger onClick={onDelete}><Trash2 size={16} /></IconBtn>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Éditeur ----------------------------- */
// L'état image d'une face : { url, blob?, path? }
//  - blob présent  => nouvelle image à téléverser à l'enregistrement
//  - path présent  => image déjà en Storage (à supprimer si retirée/remplacée)
function CardEditor({ deckId, card, onClose }) {
  const [rectoText, setRectoText] = useState(card?.rectoText || "");
  const [versoText, setVersoText] = useState(card?.versoText || "");
  const [recto, setRecto] = useState(card?.rectoImgUrl ? { url: card.rectoImgUrl, path: card.rectoImgPath } : null);
  const [verso, setVerso] = useState(card?.versoImgUrl ? { url: card.versoImgUrl, path: card.versoImgPath } : null);
  const [saving, setSaving] = useState(false);
  const online = useOnline();

  const valid = (rectoText.trim() || recto) && (versoText.trim() || verso);
  // Une image en attente doit être téléversée : c'est la seule opération qui ne
  // survit pas à une coupure (Firestore, lui, rejouera les écritures au retour).
  const needsUpload = !!(recto?.blob || verso?.blob);
  const blocked = needsUpload && !online;

  const save = async () => {
    setSaving(true);
    try {
      const cardId = card?.id || newCardId(deckId);

      const resolveFace = async (face, state, prevPath) => {
        if (state?.blob) {
          if (prevPath) await deleteImageByPath(prevPath);      // remplace l'ancienne
          const { url, path } = await uploadImage(state.blob);
          return { url, path };
        }
        if (!state && prevPath) { await deleteImageByPath(prevPath); return { url: null, path: null }; } // retirée
        return { url: state?.url ?? null, path: state?.path ?? null };                                   // inchangée
      };

      const r = await resolveFace("recto", recto, card?.rectoImgPath);
      const v = await resolveFace("verso", verso, card?.versoImgPath);

      const data = {
        rectoText, versoText,
        rectoImgUrl: r.url, rectoImgPath: r.path,
        versoImgUrl: v.url, versoImgPath: v.path,
      };

      if (card?.id) await updateCard(deckId, cardId, data);
      else await addCard(deckId, cardId, data);
      onClose();
    } catch (e) {
      console.error(e);
      alert("Enregistrement impossible. Vérifiez la connexion et réessayez.");
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{card ? "Modifier la carte" : "Nouvelle carte"}</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>
      <div className="modal-body soft-scroll p-5">
        {blocked && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-500/30">
            <WifiOff size={16} className="mt-0.5 shrink-0" />
            <span>
              Vous êtes hors ligne : l'image ne peut pas être envoyée. Le texte seul peut être
              enregistré en retirant l'image, sinon reconnectez-vous pour conserver les deux.
            </span>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FaceEditor label="Recto" text={rectoText} setText={setRectoText} img={recto} setImg={setRecto} />
          <FaceEditor label="Verso" text={versoText} setText={setVersoText} img={verso} setImg={setVerso} />
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
        {/* Le texte d'aide disparaît sur écran étroit : il comprimait les boutons
            au point de casser leur libellé sur plusieurs lignes. */}
        <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:block">Images recadrées et compressées automatiquement.</span>
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={onClose} className="flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 sm:flex-none sm:py-2">Annuler</button>
          <button
            onClick={save}
            disabled={!valid || saving || blocked}
            data-primary
            title={blocked ? "L'envoi d'une image demande une connexion" : undefined}
            className="flex-1 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2"
          >
            {saving ? "Enregistrement…" : card ? "Enregistrer" : "Ajouter la carte"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* Applique un balisage au textarea : les lignes sélectionnées sont préfixées,
   et sans sélection une ligne vide est amorcée à l'endroit du curseur. */
function useMarkup(taRef, text, setText) {
  const apply = (transform) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;

    // On étend la sélection aux lignes entières qu'elle touche.
    const debut = text.lastIndexOf("\n", s - 1) + 1;
    const finIdx = text.indexOf("\n", e);
    const fin = finIdx === -1 ? text.length : finIdx;

    const avant = text.slice(0, debut);
    const cible = text.slice(debut, fin);
    const apres = text.slice(fin);
    const remplace = transform(cible);

    // Un bloc inséré dans du texte existant a besoin d'être détaché de lui.
    const sep = avant && !avant.endsWith("\n") ? "\n" : "";
    const next = avant + sep + remplace + apres;
    setText(next);

    const pos = (avant + sep + remplace).length;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(pos, pos); }, 0);
  };

  const puces = () => apply((bloc) =>
    bloc.trim()
      ? bloc.split("\n").map((l) => (l.trim() ? (/^\s*[-•]\s+/.test(l) ? l : `- ${l.trim()}`) : l)).join("\n")
      : "- ");

  const numeros = () => apply((bloc) => {
    if (!bloc.trim()) return "1. ";
    let n = 0;
    return bloc.split("\n")
      .map((l) => (l.trim() ? `${++n}. ${l.replace(/^\s*(?:\d+[.)]|[-•])\s+/, "").trim()}` : l))
      .join("\n");
  });

  // Le tableau est composé dans sa propre fenêtre, puis inséré tel quel.
  const insertBloc = (bloc) => apply(() => bloc);

  return { puces, numeros, insertBloc };
}

function ToolBtn({ onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-white dark:hover:bg-slate-900 hover:text-violet-700 dark:hover:text-violet-300"
    >
      {children}
    </button>
  );
}

function FaceEditor({ label, text, setText, img, setImg }) {
  const ref = useRef(null);
  const taRef = useRef(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);
  const { puces, numeros, insertBloc } = useMarkup(taRef, text, setText);

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 ring-1 ring-slate-200 dark:ring-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">{label}</span>
        <div className="-mr-1 flex items-center gap-0.5">
          <ToolBtn onClick={puces} title="Liste à puces"><List size={16} /></ToolBtn>
          <ToolBtn onClick={numeros} title="Liste numérotée"><ListOrdered size={16} /></ToolBtn>
          <ToolBtn onClick={() => setTableOpen(true)} title="Tableau"><Table size={16} /></ToolBtn>
        </div>
      </div>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => continueList(e, setText)}
        rows={4}
        placeholder="Texte…"
        className="mt-1 w-full resize-y rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:border-violet-500 focus-visible:ring-4 focus-visible:ring-violet-500/10"
      />

      {/* Aperçu : le balisage est du texte, autant montrer ce qu'il donnera. */}
      {hasStructure(text) && (
        <div className="mt-2 rounded-xl bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Aperçu</span>
          <RichText text={text} />
        </div>
      )}
      {img ? (
        <div className="relative mt-2">
          <img src={img.url} alt="" className="max-h-40 w-full rounded-xl object-contain bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700" />
          <button onClick={() => setImg(null)} className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-1 text-white hover:bg-slate-900" aria-label="Retirer l'image"><X size={14} /></button>
          <button onClick={() => ref.current?.click()} className="absolute bottom-2 right-2 rounded-md bg-white/90 dark:bg-slate-900/90 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-white dark:hover:bg-slate-900">Changer</button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 py-2.5 text-sm text-slate-500 dark:text-slate-400 transition hover:border-violet-400 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400">
          <ImageIcon size={16} /> Ajouter une image
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
      {tableOpen && (
        <TableModal
          onClose={() => setTableOpen(false)}
          onInsert={(bloc) => { insertBloc(bloc); setTableOpen(false); }}
        />
      )}
      {cropSrc && (
        <CropModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(blob, previewUrl) => { setImg({ url: previewUrl, blob }); setCropSrc(null); }}
        />
      )}
    </div>
  );
}

/* Export d'une sélection vers un nouveau paquet, dont l'utilisateur est
   propriétaire. Le nom est proposé mais modifiable. */
function ExportModal({ defaultName, count, onExport, onClose }) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try { await onExport(name); }
    catch (e) { console.error(e); alert("Export impossible. Vérifiez la connexion et réessayez."); setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <FolderPlus size={18} /> Exporter la sélection
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-3 p-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Un nouveau paquet sera créé avec {count} carte{count > 1 ? "s" : ""}. Vous en serez
          propriétaire, avec son propre code de partage. Le paquet d'origine n'est pas modifié.
        </p>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nom du nouveau paquet</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && run()}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <button onClick={onClose} className="flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex-none sm:py-2">Annuler</button>
        <button
          onClick={run}
          disabled={!name.trim() || busy}
          data-primary
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
          {busy ? "Export…" : "Créer le paquet"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------- Modales annexes ------------------------- */
// Sélecteur segmenté : un réglage = une ligne de boutons, l'option active en blanc.
function Seg({ value, onChange, options }) {
  // Au-delà de trois choix, une seule ligne deviendrait illisible sur téléphone.
  const dense = options.length > 3;
  return (
    <div className={`mt-1.5 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 ${dense ? "grid grid-cols-2 sm:grid-cols-4" : "flex"}`}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={`rounded-lg px-2 py-2 text-sm font-medium transition ${dense ? "" : "flex-1"} ${
            value === o.v ? "bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-sm" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Label = ({ children }) => (
  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{children}</span>
);

/* Paramétrage d'une séance guidée : seulement le sens et le nombre de cartes.
   Le choix des cartes revient à l'algorithme, pas à l'utilisateur. */
function GuidedModal({ du, onStart, onClose }) {
  const [direction, setDirection] = useState("recto-verso");
  const [count, setCount] = useState(10);
  const max = Math.max(du.total, 1);
  const n = Math.min(count, max);

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <Sparkles size={18} /> Révision guidée
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-4 p-5">
        <p className="rounded-xl bg-violet-50 px-3 py-2.5 text-sm text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30">
          {du.echues > 0 && `${du.echues} carte${du.echues > 1 ? "s" : ""} à revoir aujourd'hui`}
          {du.echues > 0 && du.nouvelles > 0 && " · "}
          {du.nouvelles > 0 && `${du.nouvelles} nouvelle${du.nouvelles > 1 ? "s" : ""}`}
          {du.total === 0 && "Rien à réviser pour le moment : revenez à l'échéance des cartes."}
        </p>

        {du.nouvelles > 0 && du.echues === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ces cartes sont neuves : elles s'apprennent en deux réussites, puis reviendront
            à intervalles croissants. Les quatre niveaux de difficulté n'apparaissent qu'à
            partir de leur première révision.
          </p>
        )}

        <div>
          <Label>Sens</Label>
          <Seg
            value={direction}
            onChange={setDirection}
            options={[{ v: "recto-verso", label: "Recto → Verso" }, { v: "verso-recto", label: "Verso → Recto" }]}
          />
        </div>

        <div>
          <Label>Nombre de questions</Label>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="range" min={1} max={max} value={n} disabled={max < 2}
              onChange={(e) => setCount(+e.target.value)}
              className="min-w-0 flex-1 accent-violet-600"
              aria-label="Nombre de questions"
            />
            <span className="w-14 text-right text-sm text-slate-500 dark:text-slate-400">
              <b className="text-slate-900 dark:text-slate-100">{n}</b> / {max}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <button onClick={onClose} className="flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex-none sm:py-2">Annuler</button>
        <button
          onClick={() => onStart({ direction, count: n })}
          disabled={!du.total}
          data-primary
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2"
        >
          <Play size={16} /> Commencer · {n}
        </button>
      </div>
    </Modal>
  );
}

/* Paramétrage d'une série : sens, ordre, plage, filtre d'apprentissage, nombre. */
export function SessionModal({ cards, uid, restreint, onStart, onClose }) {
  const total = cards.length;
  const [direction, setDirection] = useState("recto-verso");
  const [order, setOrder] = useState("normal");
  const [filter, setFilter] = useState("toutes");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(total);
  const [count, setCount] = useState(total);

  // La plage porte sur les numéros affichés dans la liste ; le filtre s'applique ensuite.
  const size = cards.slice(from - 1, to).filter((c) => matchesFilter(c, uid, filter)).length;
  const n = Math.min(count, size);         // cartes réellement révisées

  // Bornes toujours cohérentes : 1 ≤ from ≤ to ≤ total, et count ≤ taille de la plage.
  const setRange = (nf, nt) => {
    const f = Math.min(Math.max(1, nf || 1), total);
    const t = Math.min(Math.max(f, nt || f), total);
    setFrom(f); setTo(t);
    setCount((c) => Math.min(c, t - f + 1));
  };

  const numCls = "w-16 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-center text-slate-900 dark:text-slate-100 outline-none focus-visible:border-violet-500";

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nouvelle série</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-4 p-5">
        {restreint && (
          <p className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30">
            <CheckSquare size={16} className="shrink-0" />
            Série limitée à vos {total} carte{total > 1 ? "s" : ""} sélectionnée{total > 1 ? "s" : ""}.
          </p>
        )}

        <div>
          <Label>Sens</Label>
          <Seg
            value={direction}
            onChange={setDirection}
            options={[{ v: "recto-verso", label: "Recto → Verso" }, { v: "verso-recto", label: "Verso → Recto" }]}
          />
        </div>

        <div>
          <Label>Ordre des cartes</Label>
          <Seg
            value={order}
            onChange={setOrder}
            options={[{ v: "normal", label: "Normal" }, { v: "inverse", label: "Inverse" }, { v: "aleatoire", label: "Aléatoire" }]}
          />
        </div>

        <div>
          <Label>Cartes à inclure</Label>
          <Seg
            value={filter}
            onChange={setFilter}
            options={[
              { v: "toutes", label: "Toutes" },
              { v: "jamais", label: "Jamais vues" },
              { v: "arevoir", label: "À revoir" },
              { v: "apprises", label: "Apprises" },
            ]}
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            {filter === "jamais" ? "Uniquement les cartes que vous n'avez pas encore évaluées."
              : filter === "arevoir" ? "Tout sauf les cartes apprises : les ✗ et celles jamais vues."
              : filter === "apprises" ? "Uniquement les cartes que vous avez marquées apprises."
              : "Tout le paquet, quel que soit votre suivi."}
          </p>
        </div>

        <div>
          <Label>Plage de cartes</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">de la</span>
            <input type="number" min={1} max={total} value={from} onChange={(e) => setRange(+e.target.value, to)} className={numCls} />
            <span className="text-sm text-slate-500 dark:text-slate-400">à la</span>
            <input type="number" min={from} max={total} value={to} onChange={(e) => setRange(from, +e.target.value)} className={numCls} />
            <button onClick={() => setRange(1, total)} className="rounded-lg px-2 py-1 text-sm font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10">Tout</button>
          </div>
        </div>

        <div>
          <Label>Nombre de questions</Label>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="range" min={1} max={Math.max(size, 1)} value={Math.max(n, 1)} disabled={size < 2}
              onChange={(e) => setCount(+e.target.value)}
              className="min-w-0 flex-1 accent-violet-600"
              aria-label="Nombre de questions"
            />
            <span className="w-14 text-right text-sm text-slate-500 dark:text-slate-400"><b className="text-slate-900 dark:text-slate-100">{n}</b> / {size}</span>
          </div>
          {size === 0 ? (
            <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">Aucune carte ne correspond à ces critères.</p>
          ) : n < size && (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              {order === "aleatoire" ? `${n} cartes tirées au hasard.` : `Les ${n} premières cartes retenues.`}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
        <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:block">{total} carte{total > 1 ? "s" : ""} dans le paquet</span>
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={onClose} className="flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 sm:flex-none sm:py-2">Annuler</button>
          <button
            onClick={() => onStart({ direction, order, filter, from, to, count: n })}
            disabled={!n}
            data-primary
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2"
          >
            <Play size={16} /> Commencer · {n}
          </button>
        </div>
      </div>
    </Modal>
  );
}
