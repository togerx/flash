/*
 * Réordonnancement d'une liste d'identifiants (calcul pur).
 *
 * `moveId(ids, id, targetId)` déplace `id` à la place qu'occupe `targetId` :
 * vers la droite il passe après la cible, vers la gauche avant elle — le
 * comportement attendu d'un glisser-déposer. Renvoie toujours une NOUVELLE
 * liste ; inchangée (copie) si l'un des deux ids est absent ou s'ils sont égaux.
 */
export function moveId(ids, id, targetId) {
  const next = [...ids];
  const from = next.indexOf(id);
  const to = next.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return next;
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/* Vrai si les deux listes ont le même ordre. */
export const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
