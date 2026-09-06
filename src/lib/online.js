import { useEffect, useState } from "react";

/*
 * État de la connexion réseau.
 *
 * Firestore met les écritures en file d'attente hors ligne, mais Storage n'a
 * aucun mécanisme équivalent : téléverser une image échoue purement et
 * simplement. Les écrans qui en dépendent s'appuient sur ce hook pour bloquer
 * l'action et l'expliquer, plutôt que de laisser l'utilisateur perdre sa saisie.
 *
 * navigator.onLine signale l'absence de réseau, pas l'absence d'Internet : un
 * point d'accès sans sortie sera considéré comme en ligne. C'est suffisant ici,
 * le cas courant étant le tunnel ou le mode avion.
 */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
