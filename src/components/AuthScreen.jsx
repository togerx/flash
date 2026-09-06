import { useState } from "react";
import { Mail, Lock, User, Loader2, ArrowLeft, Check } from "lucide-react";
import { Shell, Logo } from "./ui";
import { authErrorMessage } from "../lib/auth";

/* Icône Google (multicolore) en SVG inline. */
function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 36.3 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

const field = "w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

/*
 * Écran d'accueil non connecté : se connecter, créer un compte (avec pseudo),
 * réinitialiser le mot de passe, ou continuer sans compte (anonyme).
 */
export default function AuthScreen({ onSignIn, onSignUp, onGoogle, onReset, onAnon, initialEmail }) {
  const [mode, setMode] = useState("signin");   // signin | signup | reset
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(null);        // "email" | "google" | "anon"
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);       // e-mail de réinitialisation envoyé

  const run = async (kind, fn) => {
    setErr(""); setBusy(kind);
    try { await fn(); }
    catch (e) { setErr(authErrorMessage(e.code)); }
    finally { setBusy(null); }
  };

  const submit = () => {
    if (mode === "reset") return run("email", async () => { await onReset(email); setSent(true); });
    if (mode === "signup") return run("email", () => onSignUp(pseudo, email, password));
    return run("email", () => onSignIn(email, password));
  };

  const canSubmit =
    mode === "reset" ? email.trim()
      : mode === "signup" ? (pseudo.trim() && email.trim() && password.length >= 6)
      : (email.trim() && password);

  return (
    <Shell centered>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo size={96} className="mx-auto" />
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Flash</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {mode === "reset" ? "Réinitialiser le mot de passe"
              : mode === "signup" ? "Créer votre compte"
              : "Connectez-vous pour retrouver vos paquets"}
          </p>
        </div>

        {mode === "reset" && sent ? (
          <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"><Check size={22} /></div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Un lien de réinitialisation a été envoyé à <b className="text-slate-900 dark:text-slate-100">{email}</b>. Suivez-le pour choisir un nouveau mot de passe.
            </p>
            <button onClick={() => { setMode("signin"); setSent(false); }} className="mt-4 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300">Retour à la connexion</button>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            {mode !== "reset" && (
              <button
                onClick={() => run("google", onGoogle)}
                disabled={!!busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
              >
                {busy === "google" ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
                Continuer avec Google
              </button>
            )}

            {mode !== "reset" && (
              <div className="flex items-center gap-3 py-0.5">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-slate-400 dark:text-slate-500">ou</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
            )}

            {mode === "signup" && (
              <div className="relative">
                <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Pseudo" className={field} />
              </div>
            )}
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && mode === "reset" && canSubmit && submit()} placeholder="Adresse e-mail" className={field} />
            </div>
            {mode !== "reset" && (
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()} placeholder="Mot de passe" className={field} />
              </div>
            )}

            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

            <button
              onClick={submit}
              disabled={!canSubmit || !!busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
            >
              {busy === "email" && <Loader2 size={18} className="animate-spin" />}
              {mode === "reset" ? "Envoyer le lien" : mode === "signup" ? "Créer le compte" : "Se connecter"}
            </button>

            {mode === "signin" && (
              <button onClick={() => { setMode("reset"); setErr(""); }} className="w-full text-center text-sm text-slate-500 hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-300">
                Mot de passe oublié ?
              </button>
            )}
            {mode === "reset" && (
              <button onClick={() => { setMode("signin"); setErr(""); }} className="flex w-full items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-300">
                <ArrowLeft size={14} /> Retour
              </button>
            )}
          </div>
        )}

        {mode !== "reset" && (
          <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            {mode === "signin" ? "Pas encore de compte ? " : "Déjà un compte ? "}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(""); }} className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
              {mode === "signin" ? "Créer un compte" : "Se connecter"}
            </button>
          </p>
        )}

        <button onClick={() => run("anon", onAnon)} disabled={!!busy} className="mt-3 block w-full text-center text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300">
          {busy === "anon" ? "…" : "Continuer sans compte"}
        </button>
      </div>
    </Shell>
  );
}
