/*
 * Lecture d'un paquet Anki (.apkg). Deux formats coexistent :
 *
 * ANCIEN                          RÉCENT (Anki 2.1.50+, « version 3 »)
 *   collection.anki21  SQLite       collection.anki21b  SQLite compressé zstd
 *   media  index JSON               media   protobuf compressé zstd
 *   0, 1, …  fichiers bruts         0, 1, …  fichiers compressés zstd
 *
 * Piège : un export récent embarque AUSSI un collection.anki2, qui n'est pas la
 * collection mais un leurre contenant une note « Merci de mettre à jour anki ».
 * La présence de collection.anki21b doit donc primer, sinon on importe ce leurre.
 *
 * sql.js (WebAssembly), fflate et fzstd sont chargés à la demande : ils ne
 * pèsent sur le téléchargement que si l'utilisateur importe réellement un .apkg.
 */

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (b) => !!b && b.length > 4 && ZSTD_MAGIC.every((v, i) => b[i] === v);

/* --- protobuf minimal : juste ce qu'il faut pour l'index des médias ---------
   MediaEntries { repeated MediaEntry entries = 1 }
   MediaEntry   { string name = 1; uint32 size = 2; bytes sha1 = 3 }
   L'ordre des entrées donne le nom du fichier « 0 », « 1 », etc. */

function varint(buf, p) {
  let x = 0, shift = 0, b;
  do { b = buf[p++]; x += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
  return [x, p];
}

function skipField(buf, p, wire) {
  if (wire === 0) return varint(buf, p)[1];
  if (wire === 1) return p + 8;
  if (wire === 5) return p + 4;
  const [len, q] = varint(buf, p);
  return q + len;
}

/* Nom porté par une entrée (champ 1). */
function entryName(buf) {
  let p = 0;
  while (p < buf.length) {
    const [key, q] = varint(buf, p);
    const field = key >> 3, wire = key & 7;
    if (field === 1 && wire === 2) {
      const [len, r] = varint(buf, q);
      return new TextDecoder().decode(buf.subarray(r, r + len));
    }
    p = skipField(buf, q, wire);
  }
  return null;
}

/* Liste ordonnée des noms de médias. */
function parseMediaEntries(buf) {
  const names = [];
  let p = 0;
  while (p < buf.length) {
    const [key, q] = varint(buf, p);
    const field = key >> 3, wire = key & 7;
    if (field === 1 && wire === 2) {
      const [len, r] = varint(buf, q);
      names.push(entryName(buf.subarray(r, r + len)));
      p = r + len;
    } else {
      p = skipField(buf, q, wire);
    }
  }
  return names;
}

// Champs spéciaux des templates, qui ne désignent pas un champ de note.
const SPECIAL = /^(FrontSide|Tags|Type|Deck|Subdeck|Card|CardFlag|CSS)$/;

/* Noms de champs référencés par un template, dans l'ordre d'apparition.
   Gère {{Champ}}, {{text:Champ}}, {{#Conditionnel}}, {{/Conditionnel}}. */
function refs(fmt, fieldNames) {
  return [...(fmt || "").matchAll(/\{\{([^}]+)\}\}/g)]
    .map((m) => m[1].replace(/^[#^/]/, "").split(":").pop().trim())
    .filter((n) => !SPECIAL.test(n) && fieldNames.includes(n));
}

/* Modèles de notes, dans l'un ou l'autre schéma :
   - ancien : tout est sérialisé en JSON dans col.models ;
   - récent : col.models est vide, et les modèles vivent dans les tables
     notetypes / fields / templates (le champ d'ordre 0 est le recto).
   Renvoie la même forme dans les deux cas : { mid: { name, type, flds } }. */
function readModels(db) {
  const json = db.exec("SELECT models FROM col")[0]?.values?.[0]?.[0];
  if (json && json.length > 2) return JSON.parse(json);

  const models = {};
  const rows = (sql) => db.exec(sql)[0]?.values || [];

  for (const [id, name] of rows("SELECT id, name FROM notetypes")) {
    models[String(id)] = { name, type: 0, flds: [], tmpls: [] };
  }
  for (const [ntid, , name] of rows("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord")) {
    models[String(ntid)]?.flds.push({ name });
  }
  // Le blob de configuration contient le texte du template en clair : il suffit
  // d'y chercher {{cloze: pour reconnaître un modèle à trous.
  for (const [ntid, config] of rows("SELECT ntid, config FROM templates")) {
    const m = models[String(ntid)];
    if (!m || !(config instanceof Uint8Array)) continue;
    if (/\{\{\s*cloze:/i.test(new TextDecoder("utf-8", { fatal: false }).decode(config))) m.type = 1;
  }
  return models;
}

/* Quel champ va au recto, lequel au verso. Le template fait foi ; à défaut, on
   prend les deux premiers champs du modèle. */
function faceFields(model) {
  const names = model.flds.map((f) => f.name);
  const tmpl = model.tmpls?.[0] || {};
  const front = refs(tmpl.qfmt, names)[0] || names[0];
  const back = refs(tmpl.afmt, names).find((n) => n !== front) || names.find((n) => n !== front) || names[1];
  return { front, back, names };
}

/* Type MIME d'un média : signature binaire d'abord, extension en secours.
   Indispensable — un Blob sans type est refusé par la compression d'image. */
function mimeOf(name, b) {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  const ext = (name.split(".").pop() || "").toLowerCase();
  return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
           webp: "image/webp", bmp: "image/bmp", avif: "image/avif" }[ext] || "image/png";
}

/* Première image d'un champ, si son fichier est présent dans le ZIP. */
function imageOf(html, mediaByName, zip, unzstd) {
  // Les guillemets doivent être pris en compte : les noms de fichiers d'Anki
  // contiennent souvent des espaces (« annotation 2024-07-05 100245.png »).
  const m = (html || "").match(/<img[^>]+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!m) return null;
  const rawName = m[1] ?? m[2] ?? m[3];
  let name = rawName.replace(/&amp;/g, "&");
  if (!(name in mediaByName)) {
    try { name = decodeURIComponent(name); } catch { /* nom déjà décodé */ }
  }
  const idx = mediaByName[name];
  let bytes = idx != null ? zip[String(idx)] : null;
  if (!bytes) return null;
  if (isZstd(bytes)) bytes = unzstd(bytes);      // médias compressés du format v3
  return new Blob([bytes], { type: mimeOf(name, bytes) });
}

/* Lit un fichier .apkg et renvoie les cartes prêtes à importer.
   -> { cards: [{ recto, verso, rectoImg, versoImg }], stats } */
export async function readApkg(file, htmlToText) {
  const { unzipSync } = await import("fflate");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));

  // Format v3 : tout est compressé zstd, et collection.anki2 n'est qu'un leurre.
  const v3 = !!zip["collection.anki21b"];
  const unzstd = v3 ? (await import("fzstd")).decompress : null;

  const raw = v3 ? zip["collection.anki21b"] : (zip["collection.anki21"] || zip["collection.anki2"]);
  if (!raw) throw new Error("Fichier Anki illisible : aucune collection trouvée à l'intérieur.");
  const dbBytes = isZstd(raw) ? unzstd(raw) : raw;

  // Index des médias : protobuf compressé en v3, JSON { "0": "nom" } avant.
  const mediaByName = {};
  try {
    if (zip["media"]) {
      if (v3 || isZstd(zip["media"])) {
        parseMediaEntries(unzstd(zip["media"])).forEach((name, i) => { if (name) mediaByName[name] = i; });
      } else {
        for (const [idx, name] of Object.entries(JSON.parse(new TextDecoder().decode(zip["media"])))) {
          mediaByName[name] = idx;
        }
      }
    }
  } catch (e) { console.error("Index des médias illisible", e); }

  const initSqlJs = (await import("sql.js")).default;
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  const db = new SQL.Database(dbBytes);
  try {
    const models = readModels(db);
    const faces = Object.fromEntries(
      Object.entries(models).map(([id, m]) => [id, { ...faceFields(m), type: m.type, model: m }])
    );

    const res = db.exec("SELECT mid, flds FROM notes");
    const rows = res[0]?.values || [];
    const cards = [];
    const stats = { total: rows.length, cloze: 0, vides: 0, images: 0 };

    for (const [mid, flds] of rows) {
      const f = faces[String(mid)];
      if (!f) { stats.vides++; continue; }
      if (f.type === 1) { stats.cloze++; continue; }   // texte à trous : sans équivalent ici

      const values = String(flds).split("\x1f");
      const at = (name) => {
        const i = f.model.flds.findIndex((x) => x.name === name);
        return i >= 0 ? values[i] || "" : "";
      };
      const rectoHtml = at(f.front);
      const versoHtml = at(f.back);

      const rectoImg = imageOf(rectoHtml, mediaByName, zip, unzstd);
      const versoImg = imageOf(versoHtml, mediaByName, zip, unzstd);
      if (rectoImg) stats.images++;
      if (versoImg) stats.images++;

      const recto = htmlToText(rectoHtml);
      const verso = htmlToText(versoHtml);
      if (!recto && !verso && !rectoImg && !versoImg) { stats.vides++; continue; }

      cards.push({ recto, verso, rectoImg, versoImg });
    }

    return { cards, stats };
  } finally {
    db.close();
  }
}
