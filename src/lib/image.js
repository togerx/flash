import imageCompression from "browser-image-compression";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";

export const MAX_IMAGE_KB = 50;
export const OUTPUT_MAX_DIM = 1000;

/* Compresse un Blob (déjà recadré côté client) sous MAX_IMAGE_KB. */
export function compressBlob(blob) {
  return imageCompression(blob, {
    maxSizeMB: MAX_IMAGE_KB / 1024,
    maxWidthOrHeight: OUTPUT_MAX_DIM,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: "image/jpeg",
  });
}

export const SHARED_PREFIX = "deck-images/shared/";

/* Empreinte du contenu compressé. */
async function sha256(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Compresse puis téléverse une image, rangée sous l'empreinte de son contenu.
   Deux images identiques aboutissent au même fichier : copier un paquet n'a donc
   rien à dupliquer ni même à télécharger, il suffit de réutiliser le chemin.
   Renvoie { url, path }. */
export async function uploadImage(blob) {
  const compressed = await compressBlob(blob);
  const path = `${SHARED_PREFIX}${await sha256(compressed)}.jpg`;
  const r = ref(storage, path);
  try {
    // Contenu déjà présent : inutile de le renvoyer.
    return { url: await getDownloadURL(r), path };
  } catch {
    await uploadBytes(r, compressed, { contentType: "image/jpeg" });
    return { url: await getDownloadURL(r), path };
  }
}

/* Un fichier partagé peut être référencé par d'autres cartes, par un autre
   paquet ou par une copie : il n'est jamais supprimé. Seuls les anciens chemins,
   propres à une carte, continuent d'être nettoyés. */
export async function deleteImageByPath(path) {
  if (!path || path.startsWith(SHARED_PREFIX)) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    /* fichier déjà absent : on ignore */
  }
}

/* Estime le poids d'un dataURL en Ko (utilisé pour l'aperçu). */
export function sizeOfDataUrl(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.round((b64.length * 3) / 4 / 1024);
}
