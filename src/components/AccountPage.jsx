import { useState } from "react";
import { Check, RotateCcw, Trash2, Loader2, TriangleAlert, ShieldCheck, LogOut, Mail, Lock, Sun, Moon } from "lucide-react";
import { Shell, Header, StickyTop, ConfirmModal } from "./ui";
import { useTheme } from "../lib/theme";
import { authErrorMessage, needsPasswordToReauth } from "../lib/auth";
import AppUpdateRow from "./AppUpdateRow";

/*
 * Page « Compte » (onglet de la navigation) : pseudo, connexion, thème,
 * mises à jour, remise à zéro de la progression, suppression du compte.
 * Était une fenêtre (« Mon compte ») avant la barre de navigation.
 *
 * Le compte est anonyme et lié à ce navigateur : le supprimer est définitif,
 * d'où une confirmation qui énumère ce qui va disparaître plutôt qu'un vague
 * « êtes-vous sûr ».
 */
export default function AccountPage({ pseudo, decks, uid, account, onRename, onResetAll, onDelete, onLinkAccount, onSignOut }) {
  const [name, setName] = useState(pseudo);
  const [theme, toggleTheme] = useTheme();
  const [busy, setBusy] = useState(null);          // "reset" | "delete"
  const [confirm, setConfirm] = useState(null);    // "reset" | "delete"
  const [pwd, setPwd] = useState("");              // mot de passe pour confirmer la suppression
  const [err, setErr] = useState("");

  const owned = decks.filter((d) => d.owner === uid).length;
  const joined = decks.length - owned;
  const permanent = account && !account.isAnonymous;
  const needsPwd = needsPasswordToReauth();

  const openConfirm = (kind) => { setErr(""); setPwd(""); setConfirm(kind); };
  const closeConfirm = () => { setConfirm(null); setErr(""); setPwd(""); };

  const saveName = () => {
    const v = name.trim();
    if (v && v !== pseudo) onRename(v);
  };

  /* La fenêtre de confirmation reste ouverte pendant l'opération et affiche
     elle-même sa roue : on ne la ferme qu'une fois l'opération terminée.
     En cas d'échec, on affiche le message dans la fenêtre (mot de passe
     incorrect, reconnexion requise…) plutôt qu'une alerte générique. */
  const run = async (kind, fn) => {
    setErr(""); setBusy(kind);
    try { await fn(); closeConfirm(); }
    catch (e) {
      console.error(e);
      setErr(authErrorMessage(e.code));
      throw e;                       // laisse la confirmation reprendre la main
    } finally { setBusy(null); }
  };

  return (
    <>
      <Shell>
        <StickyTop>
          <Header home title="Compte" subtitle={pseudo} />
        </StickyTop>

        <div className="mt-2 space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Pseudo</span>
            <div className="mt-1.5 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus-visible:border-violet-500"
              />
              <button
                onClick={saveName}
                disabled={!name.trim() || name.trim() === pseudo}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-violet-600 px-3.5 py-2 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
              >
                <Check size={16} /> Changer
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              C'est le nom que les autres membres voient sur vos paquets.
            </p>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Connexion</span>
            {account?.isAnonymous ? (
              <>
                <button onClick={onLinkAccount} className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700">
                  <ShieldCheck size={16} /> Ajouter un e-mail ou Google
                </button>
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                  Compte local à ce navigateur. Ajoutez un compte pour retrouver vos paquets partout.
                </p>
              </>
            ) : (
              <>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                  <Mail size={16} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{account?.email || "Compte Google"}</span>
                  {account?.emailVerified
                    ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Vérifié</span>
                    : <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Non vérifié</span>}
                </div>
                <button onClick={onSignOut} className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-medium text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600">
                  <LogOut size={16} /> Se déconnecter
                </button>
              </>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Progression</span>
            <button
              onClick={() => openConfirm("reset")}
              disabled={!!busy || !decks.length}
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-900 px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 transition hover:ring-slate-300 dark:hover:ring-slate-600 disabled:opacity-40"
            >
              {busy === "reset" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              {busy === "reset" ? "Réinitialisation…" : "Réinitialiser tous les avancements"}
            </button>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Toutes les cartes de vos {decks.length} paquet{decks.length > 1 ? "s" : ""} redeviennent « jamais vues ».
              Le suivi des autres membres n'est pas touché.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Affichage</span>
            <button
              onClick={toggleTheme}
              className="mt-1.5 flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-medium text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600"
            >
              {theme === "dark" ? <Sun size={16} className="shrink-0" aria-hidden="true" /> : <Moon size={16} className="shrink-0" aria-hidden="true" />}
              <span className="flex-1 text-left">{theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}</span>
            </button>
          </div>

          <AppUpdateRow />

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Compte</span>
            <button
              onClick={() => openConfirm("delete")}
              disabled={!!busy}
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 dark:bg-red-500/10 px-4 py-2.5 font-medium text-red-700 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-500/30 transition hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-40"
            >
              {busy === "delete" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {busy === "delete" ? "Suppression…" : "Supprimer mon compte"}
            </button>
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                {permanent
                  ? "Supprime définitivement votre compte, vos paquets et votre progression. Irréversible."
                  : "Votre compte est anonyme et lié à ce navigateur : il n'existe aucun moyen de le récupérer."}
              </span>
            </p>
          </div>
        </div>
      </Shell>

      {confirm === "reset" && (
        <ConfirmModal
          title="Réinitialiser tous les avancements ?"
          body={`Vos ${decks.length} paquet${decks.length > 1 ? "s" : ""} repartiront de zéro : toutes les cartes redeviendront « jamais vues ». Le suivi des autres membres n'est pas modifié.`}
          confirmLabel="Tout réinitialiser"
          busyLabel="Réinitialisation…"
          error={err}
          onCancel={closeConfirm}
          onConfirm={() => run("reset", onResetAll)}
        />
      )}

      {confirm === "delete" && (
        <ConfirmModal
          title="Supprimer définitivement votre compte ?"
          body={
            `Cette action est irréversible.\n\n` +
            `• ${owned} paquet${owned > 1 ? "s" : ""} dont vous êtes propriétaire ser${owned > 1 ? "ont" : "a"} supprimé${owned > 1 ? "s" : ""} pour TOUS les membres, avec leurs cartes et leurs images.\n` +
            `• ${joined} paquet${joined > 1 ? "s" : ""} partagé${joined > 1 ? "s" : ""} que vous avez rejoint${joined > 1 ? "s" : ""} continuer${joined > 1 ? "ont" : "a"} d'exister, vous en serez simplement retiré.\n` +
            `• Votre pseudo et votre progression seront effacés.`
          }
          confirmLabel="Supprimer mon compte"
          busyLabel="Suppression du compte…"
          error={err}
          disabled={needsPwd && !pwd}
          onCancel={closeConfirm}
          onConfirm={() => run("delete", () => onDelete(pwd))}
        >
          {needsPwd && (
            <div className="mt-4">
              <p className="mb-1.5 text-sm text-slate-600 dark:text-slate-300">
                Confirmez avec le mot de passe de votre compte :
              </p>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  autoFocus
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Mot de passe"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-red-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          )}
          {permanent && !needsPwd && (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Une fenêtre Google s'ouvrira pour confirmer votre identité.
            </p>
          )}
        </ConfirmModal>
      )}
    </>
  );
}
