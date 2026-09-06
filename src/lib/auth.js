import {
  GoogleAuthProvider, EmailAuthProvider,
  onAuthStateChanged, signInAnonymously,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup,
  signInWithCredential, signInWithRedirect, linkWithRedirect, getRedirectResult,
  linkWithCredential, linkWithPopup,
  reauthenticateWithCredential, reauthenticateWithPopup, deleteUser,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile, reload,
  verifyPasswordResetCode, confirmPasswordReset, applyActionCode,
} from "firebase/auth";
import { getApp, initializeApp, deleteApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { auth } from "../firebase";

/*
 * Authentification.
 *
 * Trois façons d'exister :
 *   - anonyme      : session locale, pas d'e-mail. Historique de l'app.
 *   - e-mail/mdp   : compte permanent, vérifié par un LIEN envoyé par Firebase.
 *   - Google       : compte permanent via OAuth.
 *
 * La LIAISON (`link…`) transforme un compte anonyme en compte permanent SANS
 * changer l'uid : toutes les données restent en place. C'est le chemin sûr
 * quand l'utilisateur ajoute un compte pour la première fois. Si l'identifiant
 * appartient déjà à un compte (autre appareil), Firebase renvoie
 * `…-already-in-use` : on bascule alors en connexion, et la migration
 * (voir lib/migrate.js) recopie les données de l'appareil courant.
 */

const google = new GoogleAuthProvider();

// Après clic sur le lien de l'e-mail, un bouton « Continuer » ramène à l'app
// (là où elle tourne : localhost en dev, le site en prod). Le domaine doit être
// dans « Domaines autorisés » de la console (localhost et web.app le sont).
const actionSettings = () => ({ url: window.location.origin, handleCodeInApp: false });

export function watchAuth(cb) {
  return onAuthStateChanged(auth, (user) => {
    cb(user ? {
      uid: user.uid,
      isAnonymous: user.isAnonymous,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName || "",
      hasPassword: user.providerData.some((p) => p.providerId === "password"),
      hasGoogle: user.providerData.some((p) => p.providerId === "google.com"),
    } : null);
  });
}

export const currentUser = () => auth.currentUser;

export function anonSignIn() {
  return signInAnonymously(auth);
}

/* Rafraîchit l'utilisateur courant (après un clic sur le lien de vérification).
   `reload` recharge le profil, puis on force un nouveau jeton pour que
   `emailVerified` soit à jour partout (un jeton en cache resterait périmé). */
export async function refreshUser() {
  const u = auth.currentUser;
  if (!u) return false;
  await reload(u);
  if (u.emailVerified) await u.getIdToken(true).catch(() => {});
  return u.emailVerified;
}

export function sendVerification() {
  return sendEmailVerification(auth.currentUser, actionSettings());
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim(), actionSettings());
}

/* --- Liens e-mail traités DANS l'app (gestionnaire d'action personnalisé) ---
   Firebase peut router ses liens (réinitialisation, vérification) vers l'app
   plutôt que vers sa page hébergée. L'app lit alors `mode` + `oobCode` dans
   l'URL et exécute l'action elle-même — aucun serveur requis. */

// Lit un éventuel code d'action Firebase dans l'URL courante.
export function readAuthAction() {
  const p = new URLSearchParams(window.location.search);
  const mode = p.get("mode");
  const oobCode = p.get("oobCode");
  if (oobCode && ["resetPassword", "verifyEmail"].includes(mode)) return { mode, oobCode };
  return null;
}

// Retire les paramètres d'action de l'URL (une fois le lien traité).
export function clearAuthActionUrl() {
  window.history.replaceState({}, "", window.location.pathname);
}

// Valide le code de réinitialisation et renvoie l'e-mail concerné.
export function verifyResetCode(oobCode) {
  return verifyPasswordResetCode(auth, oobCode);
}

// Applique le nouveau mot de passe (après verifyResetCode).
export function confirmReset(oobCode, newPassword) {
  return confirmPasswordReset(auth, oobCode, newPassword);
}

// Applique la vérification d'e-mail, puis rafraîchit l'utilisateur courant.
export async function applyVerifyEmail(oobCode) {
  await applyActionCode(auth, oobCode);
  if (auth.currentUser) {
    await reload(auth.currentUser).catch(() => {});
    if (auth.currentUser.emailVerified) await auth.currentUser.getIdToken(true).catch(() => {});
  }
}

export function signOutUser() {
  return signOut(auth);
}

/* Un compte permanent (e-mail ou Google) exige une authentification RÉCENTE
   avant une action sensible (suppression). On réauthentifie selon le
   fournisseur : mot de passe re-saisi, ou popup Google. L'anonyme n'a rien à
   prouver. Cette étape doit précéder toute suppression de données : si elle
   échoue, aucune donnée n'est touchée. */
export async function reauthenticate(password) {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return;
  if (u.providerData.some((p) => p.providerId === "password")) {
    if (!password) { const e = new Error("password requis"); e.code = "auth/password-required"; throw e; }
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  } else if (u.providerData.some((p) => p.providerId === "google.com")) {
    await reauthenticateWithPopup(u, google);
  }
}

/* Le compte a-t-il besoin d'un mot de passe pour être réauthentifié ?
   (vrai pour un compte e-mail/mdp ; faux pour Google et anonyme). */
export function needsPasswordToReauth() {
  const u = auth.currentUser;
  return !!u && !u.isAnonymous && u.providerData.some((p) => p.providerId === "password");
}

export function deleteCurrentUser() {
  return deleteUser(auth.currentUser);
}

/* --- Création / connexion, avec liaison quand on part d'un compte anonyme ---
   Chaque fonction renvoie { user, wasLinked }.
   - wasLinked=true  : l'uid anonyme a été conservé, aucune migration à faire ;
   - wasLinked=false : on s'est connecté à un compte existant, l'appelant doit
     migrer les données de l'appareil (il les a capturées AVANT d'appeler). */

async function linkOrSignIn(credentialLink, credentialSignIn) {
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try {
      const res = await credentialLink(u);
      return { user: res.user, wasLinked: true };
    } catch (e) {
      // Identifiant déjà rattaché à un compte : on s'y connecte à la place. On
      // passe l'erreur de liaison à credentialSignIn, qui peut en extraire le
      // justificatif déjà obtenu (Google) et éviter une seconde popup.
      if (["auth/credential-already-in-use", "auth/email-already-in-use"].includes(e.code)) {
        const res = await credentialSignIn(e);
        return { user: res.user, wasLinked: false };
      }
      throw e;
    }
  }
  const res = await credentialSignIn(null);
  return { user: res.user, wasLinked: false };
}

export async function signUpEmail(email, password, pseudo) {
  const em = email.trim();
  const { user, wasLinked } = await linkOrSignIn(
    (u) => linkWithCredential(u, EmailAuthProvider.credential(em, password)),
    () => createUserWithEmailAndPassword(auth, em, password),
  );
  if (pseudo && !user.displayName) await updateProfile(user, { displayName: pseudo }).catch(() => {});
  await sendEmailVerification(user, actionSettings()).catch(() => {});
  return { user, wasLinked };
}

export function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

/* Vérifie un e-mail/mot de passe SANS toucher la session courante, via une
   instance Firebase secondaire jetable. Sert à valider le compte cible AVANT
   de supprimer la session anonyme lors d'une fusion : si les identifiants sont
   faux, on n'a encore rien détruit. Renvoie le displayName du compte (ou ""). */
export async function verifyEmailCredentials(email, password) {
  const secondary = initializeApp(getApp().options, `verify-${Date.now()}`);
  try {
    const res = await signInWithEmailAndPassword(getAuth(secondary), email.trim(), password);
    return res.user.displayName || "";
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}

export async function setDisplayName(name) {
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name }).catch(() => {});
}

export async function authGoogle() {
  const { user, wasLinked } = await linkOrSignIn(
    (u) => linkWithPopup(u, google),
    (linkErr) => {
      // Compte Google déjà existant (autre appareil) : le justificatif a déjà été
      // obtenu lors de la tentative de liaison. Le réutiliser connecte SANS
      // rouvrir une popup — une seconde popup échoue souvent
      // (auth/cancelled-popup-request, auth/popup-blocked).
      const cred = linkErr && GoogleAuthProvider.credentialFromError(linkErr);
      return cred ? signInWithCredential(auth, cred) : signInWithPopup(auth, google);
    },
  );
  return { user, wasLinked };
}

/* --- Google par REDIRECTION (repli quand la popup est bloquée) --------------
   Sur Safari/iOS, les popups sont souvent bloquées : la redirection quitte la
   page vers Google et y revient. On lie le compte anonyme (uid conservé) si l'on
   part d'une session anonyme, sinon on se connecte simplement. */
export function startGoogleRedirect() {
  const u = auth.currentUser;
  return (u && u.isAnonymous) ? linkWithRedirect(u, google) : signInWithRedirect(auth, google);
}

/* Au retour de la redirection Google. Renvoie { user, wasLinked } ou null si
   aucune redirection n'était en cours. Comme pour la popup, si le compte Google
   existe déjà, la liaison échoue et l'on s'y connecte avec le justificatif de
   l'erreur (sans nouvelle interaction) → wasLinked = false, fusion à faire. */
export async function completeGoogleRedirect() {
  let res;
  try {
    res = await getRedirectResult(auth);
  } catch (e) {
    if (["auth/credential-already-in-use", "auth/email-already-in-use"].includes(e.code)) {
      const cred = GoogleAuthProvider.credentialFromError(e);
      if (cred) { const r = await signInWithCredential(auth, cred); return { user: r.user, wasLinked: false }; }
    }
    throw e;
  }
  return res ? { user: res.user, wasLinked: true } : null;
}

/* Messages d'erreur Firebase traduits pour l'interface. */
export function authErrorMessage(code) {
  return {
    "auth/operation-not-allowed": "Ce mode de connexion n'est pas encore activé sur le serveur.",
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/user-not-found": "Aucun compte pour cet e-mail.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/email-already-in-use": "Un compte existe déjà pour cet e-mail.",
    "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
    "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
    "auth/popup-closed-by-user": "Connexion Google annulée.",
    "auth/cancelled-popup-request": "Connexion Google annulée.",
    "auth/popup-blocked": "La fenêtre Google a été bloquée par le navigateur. Autorisez les pop-ups et réessayez.",
    "auth/account-exists-with-different-credential": "Un compte existe déjà pour cet e-mail avec un autre mode de connexion.",
    "auth/network-request-failed": "Problème de connexion réseau.",
    "auth/requires-recent-login": "Reconnectez-vous, puis réessayez.",
    "auth/password-required": "Saisissez votre mot de passe pour confirmer.",
    "auth/expired-action-code": "Ce lien a expiré. Redemandez-en un nouveau.",
    "auth/invalid-action-code": "Ce lien est invalide ou a déjà été utilisé.",
  }[code] || "Opération impossible. Réessayez.";
}
