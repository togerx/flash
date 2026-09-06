/**
 * Purge des images non référencées de Firebase Storage.
 *
 * Les images sont rangées sous l'empreinte de leur contenu et partagées entre
 * cartes, paquets et copies : l'application ne les supprime donc jamais d'
 * elle-même (supprimer un fichier encore référencé ailleurs serait une perte
 * irréversible). Ce script fait le ménage hors ligne, à froid.
 *
 * Il compare les fichiers présents dans Storage aux chemins réellement cités
 * par les cartes (`rectoImgPath` / `versoImgPath`), et supprime la différence.
 *
 * PRÉREQUIS
 *   1. Console Firebase -> Paramètres du projet -> Comptes de service
 *      -> « Générer une nouvelle clé privée », enregistrée à la racine du
 *      projet sous le nom serviceAccount.json (déjà ignoré par git).
 *   2. npm install   (firebase-admin est en devDependencies)
 *
 * USAGE
 *   npm run purge:images              simulation : liste sans rien supprimer
 *   npm run purge:images -- --delete  supprime réellement
 *
 * OPTIONS (variables d'environnement)
 *   SERVICE_ACCOUNT   chemin de la clé            (défaut : serviceAccount.json)
 *   STORAGE_BUCKET    bucket                      (défaut : lu dans .env)
 *   GRACE_HOURS       âge minimal d'un fichier    (défaut : 24)
 *   PREFIX            sous-dossier à examiner     (défaut : deck-images/)
 */

import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const KEY_PATH = process.env.SERVICE_ACCOUNT || "serviceAccount.json";
const GRACE_HOURS = Number(process.env.GRACE_HOURS ?? 24);
const PREFIX = process.env.PREFIX || "deck-images/";
const DELETE = process.argv.includes("--delete");

const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;

/* Bucket : variable d'environnement, sinon .env du projet. */
function resolveBucket() {
  if (process.env.STORAGE_BUCKET) return process.env.STORAGE_BUCKET;
  try {
    const env = readFileSync(".env", "utf8");
    const m = env.match(/^VITE_FIREBASE_STORAGE_BUCKET\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch { /* pas de .env : on exigera STORAGE_BUCKET */ }
  return null;
}

function loadKey() {
  try {
    return JSON.parse(readFileSync(KEY_PATH, "utf8"));
  } catch {
    console.error(
      `\nClé de compte de service introuvable : ${KEY_PATH}\n` +
      `Console Firebase -> Paramètres du projet -> Comptes de service ->\n` +
      `« Générer une nouvelle clé privée », puis enregistrez le fichier ici.\n`
    );
    process.exit(1);
  }
}

async function main() {
  const bucketName = resolveBucket();
  if (!bucketName) {
    console.error("Bucket inconnu : renseignez STORAGE_BUCKET ou VITE_FIREBASE_STORAGE_BUCKET dans .env");
    process.exit(1);
  }

  const app = initializeApp({ credential: cert(loadKey()), storageBucket: bucketName });
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket();

  console.log(`\nBucket   : ${bucketName}`);
  console.log(`Dossier  : ${PREFIX}`);
  console.log(`Mode     : ${DELETE ? "SUPPRESSION" : "simulation (rien ne sera supprimé)"}\n`);

  // 1. Tous les chemins cités par une carte, quel que soit le paquet.
  const snap = await db.collectionGroup("cards").get();
  const used = new Set();
  snap.forEach((doc) => {
    const c = doc.data();
    if (c.rectoImgPath) used.add(c.rectoImgPath);
    if (c.versoImgPath) used.add(c.versoImgPath);
  });
  console.log(`${snap.size} carte(s) lues, ${used.size} image(s) référencée(s).`);

  // 2. Tous les fichiers présents.
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  console.log(`${files.length} fichier(s) dans Storage.\n`);

  // 3. Garde-fou : une lecture qui ne ramène rien alors que des fichiers
  //    existent trahit un problème de droits, pas un stock d'orphelins.
  if (files.length > 0 && used.size === 0) {
    console.error(
      "ARRÊT : aucune référence trouvée alors que des fichiers existent.\n" +
      "Vérifiez que la clé appartient bien à ce projet avant de réessayer."
    );
    process.exit(1);
  }

  // 4. Les fichiers récents sont épargnés : une image est téléversée avant que
  //    la carte qui la cite ne soit écrite, et un import en cours ne doit pas
  //    voir ses images disparaître sous ses pieds.
  const cutoff = Date.now() - GRACE_HOURS * 3600 * 1000;
  const orphans = [];
  let recent = 0, keptBytes = 0, orphanBytes = 0;

  for (const f of files) {
    if (used.has(f.name)) { keptBytes += Number(f.metadata.size || 0); continue; }
    if (new Date(f.metadata.timeCreated).getTime() > cutoff) { recent++; continue; }
    orphans.push(f);
    orphanBytes += Number(f.metadata.size || 0);
  }

  console.log(`Référencés : ${files.length - orphans.length - recent} (${ko(keptBytes)})`);
  console.log(`Épargnés   : ${recent} (créés il y a moins de ${GRACE_HOURS} h)`);
  console.log(`Orphelins  : ${orphans.length} (${ko(orphanBytes)})\n`);

  if (!orphans.length) {
    console.log("Rien à supprimer.");
    return;
  }

  for (const f of orphans) {
    console.log(`  ${DELETE ? "supprimé" : "à supprimer"}  ${f.name}  ${ko(Number(f.metadata.size || 0))}`);
    if (DELETE) await f.delete();
  }

  console.log(
    DELETE
      ? `\n${orphans.length} fichier(s) supprimé(s), ${ko(orphanBytes)} libérés.`
      : `\nSimulation terminée. Relancez avec --delete pour libérer ${ko(orphanBytes)}.`
  );
}

main().catch((e) => { console.error("\nÉchec :", e.message); process.exit(1); });
