import { useEffect, useRef, useState } from "react";
import {
  Plus, Play, Pencil, Trash2, Check, X, Users, LogIn, LogOut, Copy, Upload,
  Download, HardDriveDownload, Loader2, Sun, Moon, Sparkles, CheckSquare,
  Search, ArrowDownWideNarrow, ArrowUpNarrowWide, GitMerge, MoreVertical,
  ShieldCheck, Mail, Share2,
} from "lucide-react";
import { useTheme } from "./lib/theme";
import { Shell, Header, ConfirmModal, Logo, Loading, Modal, Highlight } from "./components/ui";
import DeckView from "./components/DeckView";
import DeckProgress from "./components/DeckProgress";
import ImportModal from "./components/ImportModal";
import ProfileModal from "./components/ProfileModal";
import MultiReview from "./components/MultiReview";
import GroupsModal from "./components/GroupsModal";
import GroupView from "./components/GroupView";
import AuthScreen from "./components/AuthScreen";
import AuthAction from "./components/AuthAction";
import LinkAccountModal from "./components/LinkAccountModal";
import ShareModal from "./components/ShareModal";
import { isOfflineDeck, prefetchDeck, forgetDeck } from "./lib/offline";
import {
  watchDecks, createDeck, renameDeck, deleteDeck, joinByCode, joinDeck, copyDeck, leaveDeck,
  deckProgress, canEditDeck, createDeckFromCards, ownerName, getDeck, mergeDecks,
  renamePseudo, resetAllProgress, deleteAccount, snapshotForMigration, applyMigration,
  savePendingMigration, loadPendingMigration, clearPendingMigration,
} from "./lib/decks";
import { watchGroups, createGroup, joinGroupByCode, groupHasNews } from "./lib/groups";
import { trackDecks, deckAddedAt, deckReviewedAt } from "./lib/deckMeta";
import {
  watchAuth, currentUser, anonSignIn, signUpEmail, signInEmail, authGoogle,
  startGoogleRedirect, completeGoogleRedirect,
  resetPassword, sendVerification, refreshUser, signOutUser, setDisplayName,
  readAuthAction, clearAuthActionUrl, verifyEmailCredentials,
} from "./lib/auth";

const PSEUDO_KEY = "flash.pseudo";

export default function App() {
  const [authUser, setAuthUser] = useState(undefined);   // undefined=chargement, null=déconnecté
  const [pseudo, setPseudo] = useState(() => localStorage.getItem(PSEUDO_KEY) || "");
  const [pseudoDraft, setPseudoDraft] = useState("");
  const [decks, setDecks] = useState([]);
  const [openId, setOpenId] = useState(null);
  // Ouverture directe en séance guidée depuis la liste des paquets.
  const [startGuided, setStartGuided] = useState(false);
  const [multi, setMulti] = useState(null);   // paquets d'une révision commune
  const [preview, setPreview] = useState(null);   // paquet consulté sans l'avoir rejoint
  const [groups, setGroups] = useState([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState(null);
  const [linking, setLinking] = useState(false);   // modale « ajouter un compte »
  // Lien e-mail Firebase (réinitialisation / vérification) arrivant sur l'app.
  const [authAction, setAuthAction] = useState(() => readAuthAction());
  const [loginEmail, setLoginEmail] = useState("");   // e-mail pré-rempli après reset
  const [merging, setMerging] = useState(false);      // fusion anonyme → compte existant en cours
  // Retour d'une éventuelle redirection Google traité (getRedirectResult) : tant
  // que ce n'est pas fait, on ne lance pas la reprise de migration (le cas
  // « liaison réussie, uid conservé » doit d'abord annuler le registre).
  const [redirectDone, setRedirectDone] = useState(false);

  const uid = authUser?.uid || null;
  const savePseudo = (p) => { localStorage.setItem(PSEUDO_KEY, p); setPseudo(p); };
  // Une fusion est en cours DANS cette session (évite que la reprise auto ne se
  // déclenche par-dessus). resumedRef : reprise déjà lancée pour ce chargement.
  const mergingRef = useRef(false);
  const resumedRef = useRef(false);

  useEffect(() => watchAuth(setAuthUser), []);
  // Un compte permanent porte son pseudo dans displayName : il fait autorité.
  useEffect(() => {
    if (authUser?.displayName) savePseudo(authUser.displayName);
  }, [authUser?.displayName]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Au retour sur l'onglet (après avoir cliqué le lien de vérification), on
  // rafraîchit l'utilisateur pour refléter l'e-mail vérifié sans action manuelle.
  useEffect(() => {
    if (!authUser || authUser.isAnonymous || authUser.emailVerified) return undefined;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (await refreshUser()) setAuthUser((u) => ({ ...u, emailVerified: true }));
    };
    check();   // au chargement (retour depuis le lien de vérification)
    window.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { window.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, [authUser?.uid, authUser?.emailVerified, authUser?.isAnonymous]);

  const [loadingDecks, setLoadingDecks] = useState(true);
  useEffect(() => {
    if (!uid) return undefined;
    setLoadingDecks(true);
    return watchDecks(uid, (d) => { setDecks(d); setLoadingDecks(false); });
  }, [uid]);
  useEffect(() => (uid ? watchGroups(uid, setGroups) : undefined), [uid]);
  useEffect(() => { trackDecks(decks); }, [decks]);

  /* Retour d'une redirection Google (repli quand la popup est bloquée). On lit le
     résultat une fois au chargement. Si la LIAISON a réussi (uid conservé), il n'y
     a pas de fusion à faire : on annule le registre persisté avant redirection. Si
     le compte Google existait déjà, completeGoogleRedirect s'y est connecté
     (wasLinked=false) et le registre est conservé pour la reprise ci-dessous. */
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const res = await completeGoogleRedirect();
        if (!vivant) return;
        if (res?.wasLinked) clearPendingMigration();
        if (res?.user) {
          const name = (res.user.displayName || pseudo || "").trim();
          if (name) savePseudo(name);
        }
      } catch (e) { console.error("Retour Google", e); }
      finally { if (vivant) setRedirectDone(true); }
    })();
    return () => { vivant = false; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Reprise d'une fusion interrompue : si une session précédente a été coupée
     entre la capture des données et leur écriture, le registre persisté ne
     contient plus que le reste à faire — on le termine dès qu'un compte permanent
     est là. Attend que le retour Google soit traité (redirectDone), et ne se
     déclenche pas par-dessus une fusion active de cette session. */
  useEffect(() => {
    if (!redirectDone || !authUser || authUser.isAnonymous || mergingRef.current || resumedRef.current) return undefined;
    const pending = loadPendingMigration();
    if (!pending) return undefined;
    resumedRef.current = true;
    setMerging(true);
    applyMigration(pending, authUser.uid, pending.pseudo || pseudo)
      .catch((e) => console.error("Reprise de migration", e))
      .finally(() => setMerging(false));
    return undefined;
  }, [authUser?.uid, authUser?.isAnonymous, redirectDone]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Authentifie puis, si l'on s'est connecté à un compte existant (pas une
     simple liaison), migre les données anonymes DE CET APPAREIL vers le compte.
     Le snapshot est pris AVANT, tant qu'on est encore l'utilisateur anonyme. */
  const authAndMigrate = async (pseudoForNew, fn) => {
    const cur = currentUser();
    const snap = (cur?.isAnonymous && decks.length) ? await snapshotForMigration(decks, cur.uid) : null;
    const { user, wasLinked } = await fn();
    const name = (pseudoForNew || user.displayName || pseudo || "").trim();
    if (name) { savePseudo(name); if (!user.displayName) await setDisplayName(name).catch(() => {}); }
    if (!wasLinked && snap) {
      // Compte cible déjà existant : on FUSIONNE les données de cet appareil.
      // Persisté avant d'écrire, pour reprise en cas d'interruption.
      mergingRef.current = true;
      savePendingMigration(snap, name);
      await applyMigration(snap, user.uid, name);
    }
  };

  const onSignUp = (p, email, password) => authAndMigrate(p, () => signUpEmail(email, password, p));
  const onSignIn = async (email, password) => { await signInEmail(email, password); };

  /* Connexion Google. La popup DOIT s'ouvrir dans le geste du clic : on la lance
     AVANT tout await (Safari/iOS bloque une popup ouverte après une pause
     asynchrone). Si elle est tout de même bloquée, on bascule sur une redirection
     (fiable partout), en persistant d'abord les données à fusionner au retour. */
  const onGoogleAuth = async () => {
    const cur = currentUser();
    const isAnon = !!(cur?.isAnonymous && decks.length);
    const authPromise = authGoogle();   // ouvre la popup immédiatement (dans le geste)
    // .catch : si la capture échoue, on n'interrompt pas pour autant la connexion
    // (et l'on atteint toujours le `await authPromise` qui gère la popup).
    const snap = isAnon ? await snapshotForMigration(decks, cur.uid).catch(() => null) : null;

    let res;
    try {
      res = await authPromise;
    } catch (e) {
      // Popup bloquée / annulée : repli sur la redirection.
      if (["auth/popup-blocked", "auth/cancelled-popup-request", "auth/popup-closed-by-user",
           "auth/operation-not-supported-in-this-environment"].includes(e?.code)) {
        if (snap) savePendingMigration(snap, (pseudo || "").trim());
        await startGoogleRedirect();   // quitte la page ; la suite se joue au retour
        return;
      }
      throw e;
    }

    const { user, wasLinked } = res;
    const name = (user.displayName || pseudo || "").trim();
    if (name) { savePseudo(name); if (!user.displayName) await setDisplayName(name).catch(() => {}); }
    if (!wasLinked && snap) {
      mergingRef.current = true;
      savePendingMigration(snap, name);
      await applyMigration(snap, user.uid, name);
    }
  };

  /* Depuis une session anonyme : se connecter à un compte EXISTANT et y fondre
     les données de cet appareil (UNION, sans rien perdre), PUIS supprimer la
     session anonyme (son compte et ses paquets orphelins).

     Ordre dicté par la sécurité des données :
       1. capturer les données anonymes (snapshot en mémoire) ;
       2. VÉRIFIER les identifiants cibles sur une instance secondaire — si
          faux, on s'arrête ici, rien n'est détruit ;
       2b. PERSISTER le snapshot (localStorage) — le filet anti-perte : même si
           tout casse après la suppression, la reprise le retrouve ;
       3. supprimer la session anonyme (paquets + compte) — possible seulement
          tant qu'on EST l'anonyme ;
       4. se connecter au compte cible ;
       5. fusionner les paquets sous le compte cible (applyMigration retire du
          registre chaque paquet traité ; clôturé quand tout est écrit).
     La suppression (3) n'intervient qu'après vérification (2) ET persistance (2b). */
  const onSignInExisting = async (email, password) => {
    const anon = currentUser();
    const anonDecks = decks;
    const snap = (anon?.isAnonymous && anonDecks.length) ? await snapshotForMigration(anonDecks, anon.uid) : null;
    const targetName = await verifyEmailCredentials(email, password);   // (2) lève si invalide
    if (snap) savePendingMigration(snap, targetName || pseudo);          // (2b) filet AVANT destruction
    mergingRef.current = true;
    setMerging(true);
    try {
      if (anon?.isAnonymous) await deleteAccount(anonDecks, anon.uid);   // (3) supprime l'anonyme
      // (4) reconnexion : les identifiants viennent d'être validés, donc un
      // échec ne peut être que passager — on réessaie pour ne pas rester
      // bloqué avec l'anonyme supprimé et les données seulement en mémoire.
      let res = null;
      for (let attempt = 0; !res; attempt++) {
        try { res = await signInEmail(email, password); }
        catch (e) {
          if (attempt >= 2) throw e;
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      const name = (targetName || res.user.displayName || pseudo || "").trim();
      if (name) { savePseudo(name); if (!res.user.displayName) await setDisplayName(name).catch(() => {}); }
      if (snap) await applyMigration(snap, res.user.uid, name);          // (5)
    } finally {
      setMerging(false);
    }
  };

  // Aperçu : paquet non rejoint mais consultable (publié dans un de mes
  // groupes). Chargé une fois, avec un filet qui ramène à l'accueil si le
  // paquet est introuvable (supprimé, ou lecture refusée).
  useEffect(() => {
    if (openId == null || decks.some((d) => d.id === openId)) { setPreview(null); return undefined; }
    let alive = true;
    getDeck(openId).then((d) => { if (alive && d) setPreview(d); }).catch(() => {});
    const t = setTimeout(() => { if (alive) setOpenId(null); }, 5000);
    return () => { alive = false; clearTimeout(t); };
  }, [openId, decks]);

  // Lien e-mail Firebase (reset / vérification) : l'app traite le code elle-même.
  // Prioritaire sur tout le reste (ne dépend pas de l'état de connexion).
  if (authAction) {
    const finishAuthAction = async (email) => {
      clearAuthActionUrl();
      setAuthAction(null);
      if (email) {
        // Après un reset : rejoindre l'écran de connexion (e-mail pré-rempli).
        // Quitter une éventuelle session anonyme, sinon on n'y accéderait pas.
        setLoginEmail(email);
        if (currentUser()?.isAnonymous) await signOutUser().catch(() => {});
      }
    };
    return <AuthAction action={authAction} onDone={finishAuthAction} />;
  }

  // Fusion en cours : masque la bascule anonyme → compte (évite un flash de
  // l'écran de connexion pendant la suppression puis la reconnexion).
  if (merging) {
    return (
      <Shell centered>
        <Loading label="Fusion en cours…" size={130} />
      </Shell>
    );
  }

  if (authUser === undefined) {
    return (
      <Shell centered>
        <Loading label="Connexion…" size={130} />
      </Shell>
    );
  }

  // Personne de connecté : écran d'accueil (connexion / inscription / Google).
  if (authUser === null) {
    return (
      <AuthScreen
        initialEmail={loginEmail}
        onSignIn={onSignIn}
        onSignUp={onSignUp}
        onGoogle={onGoogleAuth}
        onReset={(email) => resetPassword(email)}
        onAnon={() => anonSignIn()}
      />
    );
  }

  // Compte anonyme sans pseudo (ancien parcours) : demande d'un pseudo.
  if (authUser.isAnonymous && !pseudo) {
    return (
      <Shell centered>
        <div className="w-full max-w-sm text-center">
          <Logo size={120} className="mx-auto mb-2" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Flash</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Choisissez un pseudo pour commencer.</p>
          <div className="mt-6 flex gap-2">
            <input
              autoFocus
              value={pseudoDraft}
              onChange={(e) => setPseudoDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pseudoDraft.trim() && savePseudo(pseudoDraft.trim())}
              placeholder="Votre pseudo"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:border-violet-500 focus-visible:ring-4 focus-visible:ring-violet-500/15"
            />
            <button onClick={() => pseudoDraft.trim() && savePseudo(pseudoDraft.trim())} disabled={!pseudoDraft.trim()} className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40">Entrer</button>
          </div>
          {/* Sortie du cul-de-sac : rejoindre un vrai compte plutôt que rester
              en session anonyme sur cet appareil. */}
          <button onClick={() => signOutUser()} className="mt-4 text-sm text-slate-500 hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-300">
            J'ai un compte — se connecter
          </button>
        </div>
      </Shell>
    );
  }

  // Un paquet qu'on a rejoint vient de `decks` ; sinon (aperçu depuis un
  // groupe) on l'a chargé ponctuellement dans `preview`.
  const joined = decks.find((d) => d.id === openId);
  const open = joined || (preview?.id === openId ? preview : null);

  if (openId && !open) {
    return <Shell centered><Loading label="Ouverture du paquet…" /></Shell>;
  }
  if (multi) return <MultiReview decks={multi} uid={uid} onExit={() => setMulti(null)} />;

  const openGroup = groups.find((g) => g.id === openGroupId);
  if (openGroup) {
    return (
      <GroupView
        group={openGroup}
        uid={uid}
        pseudo={pseudo}
        myDeckIds={new Set(decks.map((d) => d.id))}
        onBack={() => setOpenGroupId(null)}
        onOpenDeck={(id) => { setOpenGroupId(null); setOpenId(id); }}
      />
    );
  }

  if (open) {
    return (
      <DeckView
        deck={open}
        uid={uid}
        pseudo={pseudo}
        groups={groups}
        isMember={!!joined}
        onJoinDeck={() => joinDeck(open.id, uid, pseudo)}
        startGuided={startGuided}
        onGuidedStarted={() => setStartGuided(false)}
        onBack={() => setOpenId(null)}
        onExportSelection={(name, ids) => copyDeck(open, uid, pseudo, { name, ids })}
      />
    );
  }

  return (
    <>
    <Home
      decks={decks}
      loadingDecks={loadingDecks}
      pseudo={pseudo}
      uid={uid}
      account={authUser}
      onRenamePseudo={async (p) => { savePseudo(p); await setDisplayName(p).catch(() => {}); await renamePseudo(decks, uid, p); }}
      onResetAll={() => resetAllProgress(decks, uid)}
      onDeleteAccount={async (password) => {
        await deleteAccount(decks, uid, password);
        localStorage.removeItem(PSEUDO_KEY);
        localStorage.removeItem("flash.offlineDecks");
        setPseudo("");
        setPseudoDraft("");
      }}
      onLinkAccount={() => setLinking(true)}
      onSignOut={async () => { await signOutUser(); localStorage.removeItem(PSEUDO_KEY); setPseudo(""); }}
      onSendVerification={() => sendVerification()}
      onRefreshUser={async () => { const ok = await refreshUser(); if (ok) setAuthUser((u) => ({ ...u, emailVerified: true })); return ok; }}
      onOpen={(id, guided) => { setOpenId(id); setStartGuided(!!guided); }}
      onMultiReview={setMulti}
      onMerge={(srcDecks, name) => mergeDecks(srcDecks, uid, pseudo, name)}
      groups={groups}
      onOpenGroups={() => setGroupsOpen(true)}
      onCreate={(name) => createDeck(name, uid, pseudo)}
      onRename={renameDeck}
      onDelete={deleteDeck}
      onCopy={(d) => copyDeck(d, uid, pseudo)}
      onImport={(name, cards, onProgress) => createDeckFromCards(name, cards, uid, pseudo, onProgress)}
      onLeave={(id) => leaveDeck(id, uid)}
      onJoin={(code) => joinByCode(code, uid, pseudo)}
    />

      {groupsOpen && (
        <GroupsModal
          groups={groups}
          onOpen={(id) => { setGroupsOpen(false); setOpenGroupId(id); }}
          onCreate={async (name) => { await createGroup(name, uid, pseudo); }}
          onJoin={async (code) => { await joinGroupByCode(code, uid, pseudo); }}
          onClose={() => setGroupsOpen(false)}
        />
      )}

      {linking && (
        <LinkAccountModal
          onCreateEmail={(email, password) => onSignUp(pseudo, email, password)}
          onSignInEmail={(email, password) => onSignInExisting(email, password)}
          onGoogle={onGoogleAuth}
          onReset={(email) => resetPassword(email)}
          onClose={() => setLinking(false)}
        />
      )}
    </>
  );
}

/* Fusion de plusieurs paquets en un nouveau. */
function MergeModal({ decks, total, onMerge, onClose }) {
  const [name, setName] = useState(`${decks[0]?.name || "Fusion"} + ${decks.length - 1}`);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try { await onMerge(name.trim() || "Paquet fusionné"); }
    catch (e) { console.error(e); alert("Fusion impossible. Vérifiez la connexion et réessayez."); setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <GitMerge size={18} /> Fusionner les paquets
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-3 p-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Un nouveau paquet réunira les {total} carte{total > 1 ? "s" : ""} de {decks.length} paquets. Les paquets d'origine ne sont pas modifiés.
        </p>
        <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700">
          {decks.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{d.name}</span>
              <span className="shrink-0 text-slate-400 dark:text-slate-500">{d.cardCount || 0} carte{(d.cardCount || 0) > 1 ? "s" : ""}</span>
            </li>
          ))}
        </ul>
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
        <button onClick={run} disabled={!name.trim() || busy} data-primary className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />} {busy ? "Fusion…" : "Créer le paquet"}
        </button>
      </div>
    </Modal>
  );
}

/* Invite les utilisateurs anonymes à rattacher un compte (masquable pour la
   session ; réapparaît au prochain lancement tant qu'aucun compte n'est ajouté). */
function SecureBanner({ onLink }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 px-3.5 py-3 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/30">
      <ShieldCheck size={18} className="shrink-0 text-violet-600 dark:text-violet-300" />
      <p className="min-w-0 flex-1 text-sm text-violet-800 dark:text-violet-200">
        Ajoutez un e-mail ou Google pour retrouver vos paquets sur tous vos appareils.
      </p>
      <div className="flex shrink-0 gap-1.5">
        <button onClick={() => setHidden(true)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:text-violet-200 dark:hover:bg-violet-500/20">Plus tard</button>
        <button onClick={onLink} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-700">Ajouter un compte</button>
      </div>
    </div>
  );
}

/* Rappelle de vérifier l'e-mail (lien envoyé par Firebase). */
function VerifyBanner({ email, onSend, onRefresh }) {
  const [state, setState] = useState(null);   // "sent" | "checking"
  const send = async () => { setState("sent"); try { await onSend(); } catch { /* ignore */ } };
  const check = async () => { setState("checking"); const ok = await onRefresh(); if (!ok) setState(null); };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30">
      <Mail size={18} className="shrink-0 text-amber-600 dark:text-amber-300" />
      <p className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-200">
        {state === "sent"
          ? `E-mail de vérification renvoyé à ${email}. Cliquez le lien, puis « J'ai vérifié ».`
          : `Vérifiez votre adresse ${email} : un lien vous a été envoyé.`}
      </p>
      <div className="flex shrink-0 gap-1.5">
        <button onClick={send} className="rounded-lg px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/20">Renvoyer</button>
        <button onClick={check} disabled={state === "checking"} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50">
          {state === "checking" && <Loader2 size={14} className="animate-spin" />} J'ai vérifié
        </button>
      </div>
    </div>
  );
}

/* Menu « ⋮ » regroupant les actions secondaires d'une vignette : hors ligne,
   copier, renommer, supprimer / quitter. Évite que quatre icônes ne débordent
   d'une vignette étroite. */
function DeckMenu({ deck, uid, copying, onShare, onCopy, onRename, onDelete, onLeave }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [saved, setSaved] = useState(() => isOfflineDeck(deck.id));
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const offlineToggle = async () => {
    if (progress) return;
    if (saved) { setSaved(false); await forgetDeck(deck.id); return; }
    setProgress({ done: 0, total: 0 });
    try { await prefetchDeck(deck.id, (done, total) => setProgress({ done, total })); setSaved(true); }
    catch (e) { console.error(e); alert("Téléchargement impossible. Réessayez."); }
    finally { setProgress(null); }
  };

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700/60";
  const isOwner = deck.owner === uid;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Plus d'actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        {progress ? <Loader2 size={16} className="animate-spin" /> : <MoreVertical size={18} />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <button onClick={offlineToggle} disabled={!!progress} className={item}>
            {progress ? <Loader2 size={16} className="animate-spin text-violet-600" />
              : saved ? <HardDriveDownload size={16} className="text-emerald-600 dark:text-emerald-400" />
              : <Download size={16} className="text-slate-400" />}
            <span className="flex-1">
              {progress ? `Téléchargement${progress.total ? ` ${progress.done}/${progress.total}` : ""}…`
                : saved ? "Retirer du hors ligne" : "Rendre disponible hors ligne"}
            </span>
            {saved && !progress && <Check size={15} className="text-emerald-600 dark:text-emerald-400" />}
          </button>
          <button onClick={() => { setOpen(false); onShare(); }} className={item}>
            <Share2 size={16} className="text-slate-400" /> Partager
          </button>
          <button onClick={() => { setOpen(false); onCopy(); }} disabled={copying} className={item}>
            <Copy size={16} className="text-slate-400" /> Copier le paquet
          </button>
          {canEditDeck(deck, uid) && (
            <button onClick={() => { setOpen(false); onRename(); }} className={item}>
              <Pencil size={16} className="text-slate-400" /> Renommer
            </button>
          )}
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
          {isOwner ? (
            <button onClick={() => { setOpen(false); onDelete(); }} className={`${item} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`}>
              <Trash2 size={16} /> Supprimer
            </button>
          ) : (
            <button onClick={() => { setOpen(false); onLeave(); }} className={`${item} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`}>
              <LogOut size={16} /> Quitter le paquet
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Home({ decks, loadingDecks, pseudo, uid, account, onRenamePseudo, onResetAll, onDeleteAccount, onLinkAccount, onSignOut, onSendVerification, onRefreshUser, onOpen, onMultiReview, onMerge, groups, onOpenGroups, onCreate, onRename, onDelete, onCopy, onLeave, onImport, onJoin }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [copying, setCopying] = useState(null);   // id du paquet en cours de copie
  const [sharing, setSharing] = useState(null);   // paquet dont on montre le partage
  const [importing, setImporting] = useState(false);
  const [profile, setProfile] = useState(false);
  const [theme, toggleTheme] = useTheme();
  // Sélection de plusieurs paquets pour une révision commune.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [merging, setMerging] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");   // recent | reviewed | name | creator
  // Sens du tri par défaut : récent d'abord pour les dates, A→Z pour le texte.
  const defaultDir = (cat) => (cat === "name" || cat === "creator" ? "asc" : "desc");
  const [sortDir, setSortDir] = useState(defaultDir("recent"));

  const choisis = decks.filter((d) => picked.has(d.id));

  // Recherche insensible à la casse et aux accents, sur le nom du paquet et le
  // nom du créateur.
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = norm(search).trim();
  const createdMs = (d) => d.createdAt?.toMillis?.() ?? 0;
  // Comparateurs en ordre CROISSANT ; le sens est appliqué ensuite.
  const comparateurs = {
    recent: (a, b) => (deckAddedAt(a.id) || createdMs(a)) - (deckAddedAt(b.id) || createdMs(b)),
    reviewed: (a, b) => deckReviewedAt(a.id) - deckReviewedAt(b.id),
    name: (a, b) => (a.name || "").localeCompare(b.name || "", "fr"),
    creator: (a, b) => ownerName(a).localeCompare(ownerName(b), "fr"),
  };
  const dir = sortDir === "asc" ? 1 : -1;
  const visibles = decks
    .filter((d) => !q || norm(d.name).includes(q) || norm(ownerName(d)).includes(q))
    .sort((a, b) => dir * comparateurs[sort](a, b));
  const togglePick = (id) =>
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const copy = async (d) => {
    setCopying(d.id);
    try { await onCopy(d); }
    catch (e) { console.error(e); alert("Copie impossible. Vérifiez la connexion et réessayez."); }
    finally { setCopying(null); }
  };

  // Échap ferme les barres de création / jonction, quel que soit le focus.
  useEffect(() => {
    if (!creating && !joining) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { setCreating(false); setJoining(false); setJoinErr(""); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, joining]);

  const submitCreate = () => { if (newName.trim()) { onCreate(newName.trim()); setNewName(""); setCreating(false); } };
  const submitJoin = async () => {
    setJoinErr("");
    try { await onJoin(joinCode); setJoinCode(""); setJoining(false); }
    catch (e) { setJoinErr(e.message || "Code invalide."); }
  };

  return (
    <Shell>
      <Header
        home
        title="Mes paquets"
        subtitle={`${decks.length} paquet${decks.length > 1 ? "s" : ""}`}
        right={
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
              title={theme === "dark" ? "Thème clair" : "Thème sombre"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-violet-700 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700 dark:hover:text-violet-300 dark:hover:ring-slate-600"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button onClick={() => setProfile(true)} aria-label="Mon compte" className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:ring-slate-300 dark:hover:ring-slate-600">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{pseudo[0]?.toUpperCase()}</span>
              {pseudo}
            </button>
          </div>
        }
      />

      {account?.isAnonymous && <SecureBanner onLink={onLinkAccount} />}
      {account && !account.isAnonymous && account.hasPassword && !account.emailVerified && (
        <VerifyBanner email={account.email} onSend={onSendVerification} onRefresh={onRefreshUser} />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700"><Plus size={17} /> Nouveau paquet</button>
        <button onClick={() => setJoining(true)} className="flex items-center gap-2 rounded-xl bg-white dark:bg-slate-900 px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:ring-slate-300 dark:hover:ring-slate-600"><LogIn size={17} /> Rejoindre par code</button>
        <button onClick={() => setImporting(true)} className="flex items-center gap-2 rounded-xl bg-white dark:bg-slate-900 px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:ring-slate-300 dark:hover:ring-slate-600"><Upload size={17} /> Importer</button>
        <button onClick={onOpenGroups} className="relative flex items-center gap-2 rounded-xl bg-white dark:bg-slate-900 px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:ring-slate-300 dark:hover:ring-slate-600">
          <Users size={17} /> Groupes
          {groups.some(groupHasNews) && (
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-violet-500" />
            </span>
          )}
        </button>
        {decks.length > 1 && (
          <button
            onClick={() => { setPicking((p) => !p); setPicked(new Set()); }}
            title="Réviser plusieurs paquets ensemble"
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold shadow-sm ring-1 transition ${
              picking
                ? "bg-violet-600 text-white ring-violet-600 hover:bg-violet-700"
                : "bg-white text-slate-800 ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600"
            }`}
          >
            <CheckSquare size={17} /> {picking ? "Terminer" : "Séléctionner"}
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 dark:bg-violet-500/10 p-4">
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreating(false); }} placeholder="Nom du paquet" className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus-visible:border-violet-500" />
          <button onClick={submitCreate} className="rounded-lg bg-violet-600 p-2 text-white hover:bg-violet-700" aria-label="Créer"><Check size={18} /></button>
          <button onClick={() => setCreating(false)} className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Annuler"><X size={18} /></button>
        </div>
      )}

      {joining && (
        <div className="mt-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white/60 p-4">
          <div className="flex items-center gap-2">
            <input autoFocus value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") submitJoin(); if (e.key === "Escape") setJoining(false); }} placeholder="Code du paquet (ex. 4F2K9A)" className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 font-mono tracking-widest text-slate-900 dark:text-slate-100 outline-none focus-visible:border-violet-500" />
            <button onClick={submitJoin} className="rounded-lg bg-slate-900 p-2 text-white hover:bg-slate-700" aria-label="Rejoindre"><Check size={18} /></button>
            <button onClick={() => { setJoining(false); setJoinErr(""); }} className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Annuler"><X size={18} /></button>
          </div>
          {joinErr && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{joinErr}</p>}
        </div>
      )}

      {!loadingDecks && decks.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un paquet ou un créateur…"
              aria-label="Rechercher un paquet"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Effacer" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <ArrowDownWideNarrow size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setSortDir(defaultDir(e.target.value)); }}
                aria-label="Trier les paquets"
                className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm font-medium text-slate-700 outline-none focus-visible:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="recent">Date d'ajout</option>
                <option value="reviewed">Dernière révision</option>
                <option value="name">Nom</option>
                <option value="creator">Créateur</option>
              </select>
            </div>
            <button
              onClick={() => setSortDir((s) => (s === "asc" ? "desc" : "asc"))}
              aria-label={sortDir === "asc" ? "Tri croissant, cliquer pour décroissant" : "Tri décroissant, cliquer pour croissant"}
              title={
                sort === "name" || sort === "creator"
                  ? (sortDir === "asc" ? "A → Z" : "Z → A")
                  : (sortDir === "asc" ? "Plus ancien d'abord" : "Plus récent d'abord")
              }
              className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:text-violet-700 hover:ring-1 hover:ring-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-violet-300"
            >
              {sortDir === "asc" ? <ArrowUpNarrowWide size={17} /> : <ArrowDownWideNarrow size={17} />}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {picking && (
          <div className="col-span-full flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/30">
            <span className="text-sm font-medium text-violet-800 dark:text-violet-200">
              {choisis.length} paquet{choisis.length > 1 ? "s" : ""} sélectionné{choisis.length > 1 ? "s" : ""}
              {choisis.length > 0 && ` · ${choisis.reduce((n, d) => n + deckProgress(d, uid).total, 0)} cartes`}
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <button
                onClick={() => setPicked(new Set(visibles.every((d) => picked.has(d.id)) ? [] : visibles.map((d) => d.id)))}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
              >
                {visibles.every((d) => picked.has(d.id)) ? "Tout décocher" : "Tout cocher"}
              </button>
              <button
                onClick={() => setMerging(true)}
                disabled={choisis.length < 2}
                title="Créer un paquet réunissant les cartes des paquets sélectionnés"
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300 disabled:opacity-40 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
              >
                <GitMerge size={15} /> Fusionner
              </button>
              <button
                onClick={() => onMultiReview(choisis)}
                disabled={!choisis.length}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
              >
                <Play size={15} /> Réviser
              </button>
            </div>
          </div>
        )}

        {loadingDecks && (
          <div className="col-span-full rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50">
            <Loading label="Chargement de vos paquets…" />
          </div>
        )}
        {!loadingDecks && decks.length === 0 && !creating && !joining && (
          <div className="col-span-full rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 py-12 text-center">
            <p className="font-medium text-slate-700 dark:text-slate-300">Aucun paquet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Créez un paquet ou rejoignez celui d'un collègue avec son code.</p>
          </div>
        )}
        {!loadingDecks && decks.length > 0 && visibles.length === 0 && (
          <div className="col-span-full rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 py-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">Aucun paquet ne correspond à « {search.trim()} ».</p>
          </div>
        )}
        {visibles.map((d) => {
          const prog = deckProgress(d, uid);
          return (
          // pas d'overflow-hidden : l'info-bulle de la barre de progression doit pouvoir déborder
          <div
            key={d.id}
            onClick={picking ? () => togglePick(d.id) : undefined}
            className={`relative rounded-2xl bg-white p-4 shadow-sm ring-1 transition hover:shadow-md dark:bg-slate-900 ${
              picking ? "cursor-pointer" : ""
            } ${
              picking && picked.has(d.id)
                ? "ring-2 ring-violet-400 dark:ring-violet-500"
                : "ring-slate-200 dark:ring-slate-700"
            } ${picking && !picked.has(d.id) ? "opacity-60" : ""}`}
          >
            {picking && (
              <input
                type="checkbox"
                checked={picked.has(d.id)}
                onChange={() => togglePick(d.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Sélectionner ${d.name}`}
                className="absolute right-3 top-3 h-4 w-4 accent-violet-600"
              />
            )}
            {renaming === d.id ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && renameVal.trim()) { onRename(d.id, renameVal.trim()); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 outline-none focus-visible:border-violet-500" />
                <button onClick={() => { if (renameVal.trim()) { onRename(d.id, renameVal.trim()); setRenaming(null); } }} className="rounded-lg bg-violet-600 p-1.5 text-white" aria-label="Valider"><Check size={16} /></button>
              </div>
            ) : (
              <button onClick={() => onOpen(d.id)} className="block w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100"><Highlight text={d.name} query={search} /></h3>
                  {d.owner !== uid && <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><Users size={12} /> Partagé</span>}
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  par <Highlight text={ownerName(d)} query={search} /> · {prog.total} carte{prog.total > 1 ? "s" : ""}
                </p>
              </button>
            )}

            {renaming !== d.id && (
              <div className="mt-3"><DeckProgress stats={prog} compact /></div>
            )}

            {renaming !== d.id && (
              <div className="mt-3 flex items-center gap-1 border-t border-slate-100 dark:border-slate-800 pt-3">
                <button onClick={() => onOpen(d.id)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"><Play size={14} /> Ouvrir</button>
                {prog.total > 0 && (
                  // Raccourci : entre directement dans la séance recommandée,
                  // sans passer par la vue du paquet ni par les réglages.
                  <button
                    onClick={() => onOpen(d.id, true)}
                    title="Lancer la séance recommandée"
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700"
                  >
                    <Sparkles size={14} /> Réviser
                  </button>
                )}
                <div className="ml-auto">
                  <DeckMenu
                    deck={d}
                    uid={uid}
                    copying={copying === d.id}
                    onShare={() => setSharing(d)}
                    onCopy={() => copy(d)}
                    onRename={() => { setRenaming(d.id); setRenameVal(d.name); }}
                    onDelete={() => setConfirmDel(d)}
                    onLeave={() => setConfirmLeave(d)}
                  />
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {confirmLeave && (
        <ConfirmModal
          title={`Quitter « ${confirmLeave.name} » ?`}
          body="Le paquet disparaîtra de votre liste, mais reste intact pour les autres membres. Vous pourrez le rejoindre à nouveau avec son code, et vous y retrouverez votre progression."
          confirmLabel="Quitter le paquet"
          onCancel={() => setConfirmLeave(null)}
          busyLabel="Sortie du paquet…"
          onConfirm={async () => { await onLeave(confirmLeave.id); setConfirmLeave(null); }}
        />
      )}

      {profile && (
        <ProfileModal
          pseudo={pseudo}
          decks={decks}
          uid={uid}
          account={account}
          onRename={onRenamePseudo}
          onResetAll={onResetAll}
          onDelete={async (password) => { await onDeleteAccount(password); setProfile(false); }}
          onLinkAccount={() => { setProfile(false); onLinkAccount(); }}
          onSignOut={onSignOut}
          onClose={() => setProfile(false)}
        />
      )}

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImport={async (name, cards, onProgress) => { const r = await onImport(name, cards, onProgress); setImporting(false); return r; }}
        />
      )}

      {merging && (
        <MergeModal
          decks={choisis}
          total={choisis.reduce((n, d) => n + deckProgress(d, uid).total, 0)}
          onClose={() => setMerging(false)}
          onMerge={async (name) => {
            await onMerge(choisis, name);
            setMerging(false); setPicking(false); setPicked(new Set());
          }}
        />
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Supprimer « ${confirmDel.name} » ?`}
          body="Le paquet et toutes ses cartes seront retirés. Cette action est définitive."
          confirmLabel="Supprimer le paquet"
          onCancel={() => setConfirmDel(null)}
          busyLabel="Suppression du paquet…"
          onConfirm={async () => { await onDelete(confirmDel.id, confirmDel.code); setConfirmDel(null); }}
        />
      )}

      {sharing && (
        // On repasse par le paquet VIVANT de la liste (et non l'instantané figé
        // au clic) : sans quoi le toggle « membres peuvent modifier » écrirait
        // dans Firestore sans que l'interrupteur ne reflète le changement.
        <ShareModal deck={decks.find((d) => d.id === sharing.id) || sharing} uid={uid} groups={groups} onClose={() => setSharing(null)} />
      )}
    </Shell>
  );
}
