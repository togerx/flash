/*
 * Petit assistant de flux de travail git pour Flash.
 *
 * Objectif : développer une fonctionnalité ou corriger un bug sans retenir la
 * syntaxe git. Quatre commandes, toutes via npm :
 *
 *   npm run work -- "corrige l'alignement des séparateurs"
 *       → part de `main` à jour et crée une branche « work/corrige-l-alignement… »
 *
 *   npm run save -- "message de ce que j'ai fait"
 *       → enregistre TOUT le travail en cours (git add -A + commit)
 *
 *   npm run push
 *       → publie la branche courante sur GitHub (et affiche le lien pour ouvrir
 *         une Pull Request)
 *
 *   npm run sync
 *       → revient sur `main` et récupère la dernière version depuis GitHub
 *
 * Cycle type :  npm run work -- "…"   →  (coder, npm run dev)   →
 *               npm run save -- "…"   →  npm run push
 *
 * Sans argument (`npm run flow`), la liste des commandes s'affiche.
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Exécute et renvoie la sortie (silencieux). Lève si la commande échoue.
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
// Exécute en laissant git écrire directement dans le terminal.
const loud = (cmd) => execSync(cmd, { stdio: "inherit" });
// Vrai si la commande réussit (sert à tester l'existence d'un remote, etc.).
const ok = (cmd) => { try { out(cmd); return true; } catch { return false; } };

// Transforme une description en nom de branche sûr : minuscules, sans accents,
// tirets à la place des espaces, 50 caractères max.
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "wip";

const hasOrigin = () => ok("git remote get-url origin");
const branch = () => out("git rev-parse --abbrev-ref HEAD");
const dirty = () => out("git status --porcelain");

// Commit via un fichier temporaire (-F) : robuste aux caractères spéciaux du
// message (!, %, guillemets…) que le shell Windows interpréterait autrement.
function commit(message) {
  const f = join(tmpdir(), `flash-commit-${Date.now()}.txt`);
  writeFileSync(f, `${message}\n`);
  try { loud(`git commit -F "${f}"`); } finally { try { unlinkSync(f); } catch { /* rien */ } }
}

// URL « comparer / ouvrir une PR » à partir de l'URL du remote.
function prUrl(br) {
  try {
    const url = out("git remote get-url origin")
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/\.git$/, "");
    if (url.includes("github.com")) return `${url}/compare/${br}?expand=1`;
  } catch { /* pas de remote */ }
  return null;
}

const [sub, ...rest] = process.argv.slice(2);
const arg = rest.join(" ").trim();

const aide = `Commandes de flux de travail :

  npm run work -- "description"   nouvelle branche de travail (part de main à jour)
  npm run save -- "message"       enregistre tout le travail (add + commit)
  npm run push                    publie la branche courante sur GitHub
  npm run sync                    revient sur main et le met à jour

Cycle : work → (coder + npm run dev) → save → push`;

try {
  switch (sub) {
    case "work": {
      if (!arg) { console.error('✗ Donne une description : npm run work -- "corrige le bug X"'); process.exit(1); }
      if (dirty()) {
        console.error('✗ Tu as des modifications non enregistrées. Fais d’abord `npm run save -- "…"`');
        console.error("  (ou `git stash` si tu veux les mettre de côté).");
        process.exit(1);
      }
      const b = `work/${slug(arg)}`;
      loud("git checkout main");
      if (hasOrigin()) { try { loud("git pull --ff-only origin main"); } catch { /* hors ligne : on continue */ } }
      loud(`git checkout -b ${b}`);
      console.log(`\n✓ Branche « ${b} » prête. Quand tu as fini : npm run save -- "…"  puis  npm run push`);
      break;
    }

    case "save": {
      loud("git add -A");
      if (!dirty()) { console.log("Rien à enregistrer (aucune modification)."); break; }
      commit(arg || "Travail en cours");
      console.log("✓ Enregistré. Publier : npm run push");
      break;
    }

    case "push": {
      if (!hasOrigin()) {
        console.error("✗ Aucun dépôt distant n’est configuré.");
        console.error("  Ajoute-le une fois : git remote add origin <URL-du-dépôt-GitHub>");
        process.exit(1);
      }
      const b = branch();
      loud(`git push -u origin ${b}`);
      const link = prUrl(b);
      if (b === "main") console.log("\n✓ Poussé sur origin/main.");
      else console.log(`\n✓ Poussé sur origin/${b}.${link ? `\n  Ouvrir une Pull Request : ${link}` : ""}`);
      break;
    }

    case "sync": {
      if (dirty()) {
        console.error('✗ Modifications non enregistrées. Fais `npm run save -- "…"` avant de synchroniser.');
        process.exit(1);
      }
      loud("git checkout main");
      if (hasOrigin()) loud("git pull --ff-only origin main");
      else console.log("(Aucun dépôt distant : rien à récupérer.)");
      break;
    }

    default:
      console.log(aide);
  }
} catch (e) {
  // execSync a déjà affiché l'erreur de git ; on sort proprement.
  process.exit(e.status || 1);
}
