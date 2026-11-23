/*
 * Rangement du catalogue d'un groupe par dossier — calcul pur (sans Firestore).
 *
 * Filtre actif : null = tous · "none" = sans dossier · sinon l'id d'un dossier.
 * Un `folderId` qui ne correspond plus à aucun dossier (dossier supprimé par le
 * propriétaire du groupe) compte comme « sans dossier » : l'entrée n'est jamais
 * perdue de vue, même si son auteur ne l'a pas encore reclassée.
 */

/* Droits sur un dossier (décision utilisateur) : tout membre en crée ; seuls
   son créateur et le propriétaire du groupe le renomment ou le suppriment. Les
   règles Firestore appliquent la même chose côté serveur. */
export function canManageFolder(folder, uid, group) {
  return !!uid && (folder?.createdBy === uid || group?.owner === uid);
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/* Ordre d'affichage : alphabétique. Un ordre manuel exigerait de réécrire les
   dossiers des autres, ce que les droits interdisent. */
export function sortFolders(folders) {
  return [...(folders || [])].sort((a, b) => collator.compare(a.name || "", b.name || ""));
}

/* Dossier EFFECTIF d'une entrée : son id s'il existe encore, sinon null. */
export function folderOfEntry(entry, folders) {
  const id = entry?.folderId;
  return id && (folders || []).some((f) => f.id === id) ? id : null;
}

export function filterCatalog(catalog, folders, active) {
  if (!active) return catalog;
  if (active === "none") return catalog.filter((e) => folderOfEntry(e, folders) === null);
  return catalog.filter((e) => folderOfEntry(e, folders) === active);
}

/* Nombre d'entrées par dossier, plus la clé "none" (sans dossier). */
export function countByFolder(catalog, folders) {
  const counts = { none: 0 };
  for (const f of folders || []) counts[f.id] = 0;
  for (const e of catalog) {
    const id = folderOfEntry(e, folders);
    counts[id ?? "none"] += 1;
  }
  return counts;
}
