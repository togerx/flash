import { describe, expect, it } from "vitest";
import { isDeckOrder, sortCards } from "./cardSort";

const ts = (ms) => ({ toMillis: () => ms });
const cards = [
  { id: "a", rectoText: "Été", versoText: "zèbre", createdAt: ts(300) },
  { id: "b", rectoText: "abricot", versoText: "", createdAt: ts(100) },
  { id: "c", rectoText: "", versoText: "Âne", createdAt: null },   // création en attente
  { id: "d", rectoText: "carte 10", versoText: "b", createdAt: ts(200) },
  { id: "e", rectoText: "carte 2", versoText: "B", createdAt: ts(200) },
];
const ids = (list) => list.map((c) => c.id).join("");

describe("sortCards", () => {
  it("ordre du paquet : tel quel, ou inversé", () => {
    expect(ids(sortCards(cards, { key: "deck", dir: "asc" }))).toBe("abcde");
    expect(ids(sortCards(cards, { key: "deck", dir: "desc" }))).toBe("edcba");
  });

  it("date de création : horodatage en attente = la plus récente, égalité départagée par l'ordre du paquet", () => {
    expect(ids(sortCards(cards, { key: "created", dir: "asc" }))).toBe("bdeac");
    expect(ids(sortCards(cards, { key: "created", dir: "desc" }))).toBe("cadeb");
  });

  it("question : accents ignorés, nombres naturels (2 avant 10), cartes sans texte à la fin", () => {
    expect(ids(sortCards(cards, { key: "recto", dir: "asc" }))).toBe("bedac");
    expect(ids(sortCards(cards, { key: "recto", dir: "desc" }))).toBe("adebc");
  });

  it("réponse : casse ignorée, cartes sans texte à la fin dans les deux sens", () => {
    expect(ids(sortCards(cards, { key: "verso", dir: "asc" }))).toBe("cdeab");
    expect(ids(sortCards(cards, { key: "verso", dir: "desc" }))).toBe("adecb");
  });

  it("utilise l'extracteur de texte fourni (balisage retiré par l'appelant)", () => {
    const tagged = [
      { id: "x", rectoText: "<b>zz</b>" },
      { id: "y", rectoText: "<b>aa</b>" },
    ];
    const strip = (s) => (s || "").replace(/<[^>]+>/g, "");
    expect(ids(sortCards(tagged, { key: "recto", dir: "asc" }, strip))).toBe("yx");
  });

  it("ne modifie pas la liste reçue", () => {
    sortCards(cards, { key: "recto", dir: "desc" });
    expect(ids(cards)).toBe("abcde");
  });
});

describe("isDeckOrder", () => {
  it("vrai seulement pour l'ordre du paquet croissant (seul cas où glisser-déposer a un sens)", () => {
    expect(isDeckOrder({ key: "deck", dir: "asc" })).toBe(true);
    expect(isDeckOrder({ key: "deck", dir: "desc" })).toBe(false);
    expect(isDeckOrder({ key: "recto", dir: "asc" })).toBe(false);
  });
});
