import { describe, expect, it } from "vitest";
import { parseDeckView } from "./deckView";

describe("parseDeckView", () => {
  it("reconnaît la grille, et retombe sur la liste pour tout le reste", () => {
    expect(parseDeckView("grid")).toBe("grid");
    expect(parseDeckView("list")).toBe("list");
    expect(parseDeckView(null)).toBe("list");        // jamais choisi
    expect(parseDeckView("mosaïque")).toBe("list");  // valeur inconnue (ancienne version, saisie)
  });
});
