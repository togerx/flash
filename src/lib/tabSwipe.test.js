import { describe, expect, it } from "vitest";
import {
  dragOffset, enterMotion, neighborTab, scrollerKeepsSwipe, shouldCommit, swipeAxis, swipeDir, swipeProgress,
} from "./tabSwipe";

describe("glissement entre onglets", () => {
  it("trouve l'onglet voisin, et rien au bout de la barre", () => {
    expect(neighborTab("decks", 1)).toBe("groups");
    expect(neighborTab("groups", -1)).toBe("decks");
    expect(neighborTab("decks", -1)).toBeNull();
    expect(neighborTab("account", 1)).toBeNull();
  });

  it("doigt vers la gauche = onglet suivant", () => {
    expect(swipeDir(-40)).toBe(1);
    expect(swipeDir(40)).toBe(-1);
  });

  it("ne tranche l'axe qu'après quelques pixels, et seulement si le geste est franchement horizontal", () => {
    expect(swipeAxis(4, 3)).toBeNull();   // simple appui
    expect(swipeAxis(30, 5)).toBe("x");
    expect(swipeAxis(5, 30)).toBe("y");   // défilement vertical
    expect(swipeAxis(20, 18)).toBe("y");  // diagonale : on laisse défiler
  });

  it("change d'onglet sur un glissé long (30 % de la largeur)", () => {
    expect(shouldCommit(-120, 400, 0, true)).toBe(true);
    expect(shouldCommit(-100, 400, 0, true)).toBe(false);   // trop court, lent
  });

  it("accepte un lancé rapide plus court, s'il va dans le même sens", () => {
    expect(shouldCommit(-70, 400, -0.9, true)).toBe(true);
    expect(shouldCommit(-70, 400, 0.9, true)).toBe(false);   // le doigt revient
    expect(shouldCommit(-40, 400, -2, true)).toBe(false);    // trop court même rapide
  });

  it("ne change jamais d'onglet au bout de la barre, où la page résiste", () => {
    expect(shouldCommit(-300, 400, -2, false)).toBe(false);
    expect(dragOffset(100, false)).toBe(25);
    expect(dragOffset(100, true)).toBe(100);
  });

  it("mesure l'avancement vers le seuil, plafonné à 1", () => {
    expect(swipeProgress(-60, 400)).toBeCloseTo(0.5);
    expect(swipeProgress(-300, 400)).toBe(1);
    expect(swipeProgress(-60, 0)).toBe(0);
  });

  it("une zone qui défile latéralement garde le geste, puis le cède en butée", () => {
    expect(scrollerKeepsSwipe(0, 300, 1)).toBe(true);
    expect(scrollerKeepsSwipe(0, 300, -1)).toBe(false);
    expect(scrollerKeepsSwipe(300, 300, 1)).toBe(false);
    expect(scrollerKeepsSwipe(150, 300, -1)).toBe(true);
  });

  it("au tap sur la barre, l'onglet arrive du côté de son icône, plus loin s'il est éloigné", () => {
    const near = enterMotion("decks", "groups");
    const far = enterMotion("decks", "account");
    expect(near.offset).toBeGreaterThan(0);                           // vient de la droite
    expect(enterMotion("account", "decks").offset).toBeLessThan(0);   // vient de la gauche
    expect(far.offset).toBeGreaterThan(near.offset);
    expect(far.duration).toBeGreaterThan(near.duration);
  });

  it("après un glissé, l'onglet arrive d'un cran, du côté du geste", () => {
    expect(enterMotion("decks", "groups", 1)).toEqual(enterMotion("groups", "account", 1));
    expect(enterMotion("groups", "decks", -1).offset).toBeLessThan(0);
  });
});
