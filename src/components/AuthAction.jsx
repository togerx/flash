import { useEffect, useState } from "react";
import { Lock, Loader2, Check, TriangleAlert, MailCheck } from "lucide-react";
import { Shell, Logo } from "./ui";
import { verifyResetCode, confirmReset, applyVerifyEmail, authErrorMessage } from "../lib/auth";

const field = "w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

/*
 * Écran de traitement d'un lien e-mail Firebase reçu par l'utilisateur
 * (réinitialisation de mot de passe, vérification d'e-mail). Firebase route ces
 * liens vers l'app avec `mode` + `oobCode` dans l'URL ; on exécute l'action ici
 * même, sans serveur ni page Firebase intermédiaire.
 *
 * - resetPassword : on valide le code (ce qui donne l'e-mail), on demande un
 *   nouveau mot de passe, puis on l'applique. Ensuite → connexion (e-mail
 *   pré-rempli).
 * - verifyEmail   : on applique le code, on affiche une confirmation, puis on
 *   poursuit vers l'app.
 *
 * `onDone(email?)` est appelé une fois terminé : l'appelant nettoie l'URL et
 * réoriente (écran de connexion avec l'e-mail, ou retour à l'app).
 */
export default function AuthAction({ action, onDone }) {
  const { mode, oobCode } = action;
  const [phase, setPhase] = useState("loading");   // loading | form | done | error
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (mode === "resetPassword") {
          const mail = await verifyResetCode(oobCode);
          if (!alive) return;
          setEmail(mail);
          setPhase("form");
        } else if (mode === "verifyEmail") {
          await applyVerifyEmail(oobCode);
          if (!alive) return;
          setPhase("done");
        }
      } catch (e) {
        if (!alive) return;
        setErr(authErrorMessage(e.code));
        setPhase("error");
      }
    })();
    return () => { alive = false; };
  }, [mode, oobCode]);

  const submitReset = async () => {
    setErr(""); setBusy(true);
    try {
      await confirmReset(oobCode, password);
      setPhase("done");
    } catch (e) {
      setErr(authErrorMessage(e.code));
    } finally { setBusy(false); }
  };

  return (
    <Shell centered>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo size={96} className="mx-auto" />
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Flash</h1>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-4 text-slate-500 dark:text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Vérification du lien…</p>
            </div>
          )}

          {phase === "form" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Choisissez un nouveau mot de passe pour <b className="text-slate-900 dark:text-slate-100">{email}</b>.
              </p>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && password.length >= 6 && !busy && submitReset()}
                  placeholder="Nouveau mot de passe (6 caractères min.)"
                  className={field}
                />
              </div>
              {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
              <button
                onClick={submitReset}
                disabled={password.length < 6 || busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
              >
                {busy && <Loader2 size={18} className="animate-spin" />} Enregistrer le mot de passe
              </button>
            </div>
          )}

          {phase === "done" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                {mode === "verifyEmail" ? <MailCheck size={22} /> : <Check size={22} />}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {mode === "verifyEmail"
                  ? "Votre adresse e-mail est vérifiée."
                  : "Votre mot de passe a été changé. Connectez-vous avec le nouveau."}
              </p>
              <button
                onClick={() => onDone(mode === "resetPassword" ? email : undefined)}
                className="w-full rounded-xl bg-violet-600 py-2.5 font-semibold text-white transition hover:bg-violet-700"
              >
                {mode === "verifyEmail" ? "Continuer" : "Se connecter"}
              </button>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                <TriangleAlert size={22} />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{err}</p>
              <button
                onClick={() => onDone()}
                className="w-full rounded-xl bg-white py-2.5 font-medium text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600"
              >
                Retour
              </button>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
