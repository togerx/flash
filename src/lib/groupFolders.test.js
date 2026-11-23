import { describe, expect, it } from "vitest";
import { canManageFolder, countByFolder, filterCatalog, folderOfEntry, sortFolders } from "./groupFolders";

describe("canManageFolder", () => {
  const group = { owner: "proprio" };
  const folder = { id: "f", name: "X", createdBy: "alice" };
  it("le créateur du dossier et le propriétaire du groupe peuvent le gérer", () => {
    expect(canManageFolder(folder, "alice", group)).toBe(true);
    expect(canManageFolder(folder, "proprio", group)).toBe(true);
  });
  it("un autre membre ne peut pas ; ni personne sans uid", () => {
    expect(canManageFolder(folder, "bob", group)).toBe(false);
    expect(canManageFolder(folder, null, group)).toBe(false);
    expect(canManageFolder({ id: "f" }, undefined, { owner: undefined })).toBe(false);
  });
});

describe("sortFolders", () => {
  it("ordre alphabétique, accents/casse ignorés, nombres naturels ; liste d'origine intacte", () => {
    const folders = [{ name: "Chapitre 10" }, { name: "écologie" }, { name: "Chapitre 2" }, { name: "Algèbre" }];
    expect(sortFolders(folders).map((f) => f.name)).toEqual(["Algèbre", "Chapitre 2", "Chapitre 10", "écologie"]);
    expect(folders[0].name).toBe("Chapitre 10");
    expect(sortFolders(undefined)).toEqual([]);
  });
});

const folders = [{ id: "f1", name: "Algèbre" }, { id: "f2", name: "Géométrie" }];
const catalog = [
  { deckId: "a", folderId: "f1" },
  { deckId: "b" },                       // jamais rangé
  { deckId: "c", folderId: "f2" },
  { deckId: "d", folderId: "supprime" }, // dossier supprimé par le propriétaire
  { deckId: "e", folderId: "f1" },
];
const ids = (list) => list.map((e) => e.deckId).join("");

describe("folderOfEntry", () => {
  it("renvoie le dossier s'il existe encore, sinon null", () => {
    expect(folderOfEntry(catalog[0], folders)).toBe("f1");
    expect(folderOfEntry(catalog[1], folders)).toBeNull();
    expect(folderOfEntry(catalog[3], folders)).toBeNull();
    expect(folderOfEntry(catalog[0], undefined)).toBeNull();   // groupe sans dossiers
  });
});

describe("filterCatalog", () => {
  it("sans filtre : tout le catalogue", () => {
    expect(ids(filterCatalog(catalog, folders, null))).toBe("abcde");
  });
  it("un dossier : ses seules entrées", () => {
    expect(ids(filterCatalog(catalog, folders, "f1"))).toBe("ae");
    expect(ids(filterCatalog(catalog, folders, "f2"))).toBe("c");
  });
  it("sans dossier : jamais rangées ET rangées dans un dossier supprimé", () => {
    expect(ids(filterCatalog(catalog, folders, "none"))).toBe("bd");
  });
});

describe("countByFolder", () => {
  it("compte chaque dossier et « sans dossier », dont le total = catalogue", () => {
    expect(countByFolder(catalog, folders)).toEqual({ none: 2, f1: 2, f2: 1 });
  });
  it("dossier vide présent avec 0", () => {
    expect(countByFolder([], folders)).toEqual({ none: 0, f1: 0, f2: 0 });
  });
});
