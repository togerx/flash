import { describe, expect, it } from "vitest";
import { moveId, sameOrder } from "./listOrder";

describe("moveId", () => {
  const ids = ["a", "b", "c", "d"];
  it("vers la droite : se place après la cible", () => {
    expect(moveId(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });
  it("vers la gauche : se place avant la cible", () => {
    expect(moveId(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });
  it("voisins immédiats : échange", () => {
    expect(moveId(ids, "b", "c")).toEqual(["a", "c", "b", "d"]);
    expect(moveId(ids, "c", "b")).toEqual(["a", "c", "b", "d"]);
  });
  it("cible identique ou absente : ordre inchangé, nouvelle liste", () => {
    const same = moveId(ids, "b", "b");
    expect(same).toEqual(ids);
    expect(same).not.toBe(ids);
    expect(moveId(ids, "b", "zz")).toEqual(ids);
    expect(moveId(ids, "zz", "b")).toEqual(ids);
  });
  it("ne modifie pas la liste reçue", () => {
    moveId(ids, "a", "d");
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});

describe("sameOrder", () => {
  it("compare l'ordre élément par élément", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });
});
