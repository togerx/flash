import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UPDATE_CHECK_INTERVAL_MS, checkForUpdate, checkInBackground, trackRegistration,
  enterReview, isReviewing, onReviewingChange,
} from "./appUpdate";

const START = 1_000_000;

/* Service worker simulé : `setState` lui fait changer d'état. */
function fakeWorker(state) {
  return Object.assign(new EventTarget(), { state });
}

function setState(worker, state) {
  Object.assign(worker, { state });
  worker.dispatchEvent(new Event("statechange"));
}

function fakeRegistration(fields = {}, update = vi.fn(async () => undefined)) {
  return { waiting: null, installing: null, update, ...fields };
}

function setOnline(onLine) {
  vi.stubGlobal("navigator", { onLine });
}

beforeEach(() => setOnline(true));
afterEach(() => vi.unstubAllGlobals());

describe("recherche demandée par l'utilisateur", () => {
  it("sans service worker (développement, navigateur ancien) : indisponible", async () => {
    trackRegistration(undefined, vi.fn(), START);
    expect(await checkForUpdate(START)).toBe("unavailable");
  });

  it("rien de nouveau : à jour, pas de bandeau", async () => {
    const prompt = vi.fn();
    const registration = fakeRegistration();
    trackRegistration(registration, prompt, START);
    expect(await checkForUpdate(START)).toBe("up-to-date");
    expect(registration.update).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("version déjà en attente (bandeau fermé) : le bandeau rouvre, sans nouvelle requête", async () => {
    const prompt = vi.fn();
    const registration = fakeRegistration({ waiting: fakeWorker("installed") });
    trackRegistration(registration, prompt, START);
    expect(await checkForUpdate(START)).toBe("available");
    expect(prompt).toHaveBeenCalledOnce();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("nouvelle version trouvée : attend la fin de son installation", async () => {
    const prompt = vi.fn();
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    trackRegistration(registration, prompt, START);
    const result = checkForUpdate(START);
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalled());
    await Promise.resolve();
    Object.assign(registration, { waiting: worker, installing: null });
    setState(worker, "installed");
    expect(await result).toBe("available");
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("installation ratée : échec", async () => {
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    trackRegistration(registration, vi.fn(), START);
    const result = checkForUpdate(START);
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalled());
    await Promise.resolve();
    setState(worker, "redundant");
    expect(await result).toBe("failed");
  });

  it("hors connexion : pas de requête ; serveur injoignable : échec", async () => {
    const registration = fakeRegistration();
    trackRegistration(registration, vi.fn(), START);
    setOnline(false);
    expect(await checkForUpdate(START)).toBe("offline");
    expect(registration.update).not.toHaveBeenCalled();

    setOnline(true);
    trackRegistration(fakeRegistration({}, vi.fn(() => Promise.reject(new Error("réseau")))), vi.fn(), START);
    expect(await checkForUpdate(START)).toBe("failed");
  });
});

describe("vérification au retour dans l'app", () => {
  it("au plus une fois par intervalle, à compter de l'ouverture", () => {
    const registration = fakeRegistration();
    trackRegistration(registration, vi.fn(), START);
    checkInBackground(START + UPDATE_CHECK_INTERVAL_MS - 1);
    expect(registration.update).not.toHaveBeenCalled();
    checkInBackground(START + UPDATE_CHECK_INTERVAL_MS);
    expect(registration.update).toHaveBeenCalledOnce();
    checkInBackground(START + UPDATE_CHECK_INTERVAL_MS + 1);
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it("une version en attente ne rouvre pas un bandeau fermé ; rien hors connexion", () => {
    const prompt = vi.fn();
    const waiting = fakeRegistration({ waiting: fakeWorker("installed") });
    trackRegistration(waiting, prompt, START);
    checkInBackground(START + UPDATE_CHECK_INTERVAL_MS);
    expect(waiting.update).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();

    const registration = fakeRegistration();
    trackRegistration(registration, prompt, START);
    setOnline(false);
    checkInBackground(START + UPDATE_CHECK_INTERVAL_MS);
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("une erreur réseau reste silencieuse", async () => {
    const update = vi.fn(() => Promise.reject(new Error("réseau")));
    trackRegistration(fakeRegistration({}, update), vi.fn(), START);
    checkInBackground(START + UPDATE_CHECK_INTERVAL_MS);
    expect(update).toHaveBeenCalledOnce();
    await Promise.resolve();
  });
});

describe("révision en cours", () => {
  it("compte les écrans ouverts (une révision peut en monter une autre) et prévient à chaque changement", () => {
    const seen = [];
    const stop = onReviewingChange((v) => seen.push(v));
    expect(isReviewing()).toBe(false);
    const closeA = enterReview();
    const closeB = enterReview();
    closeA();
    expect(isReviewing()).toBe(true);    // B encore ouvert
    closeB();
    expect(isReviewing()).toBe(false);
    expect(seen).toEqual([true, true, true, false]);
    stop();
  });

  it("fermer deux fois ne fait pas passer le compteur sous zéro", () => {
    const close = enterReview();
    close();
    close();
    expect(isReviewing()).toBe(false);
    const closeAgain = enterReview();
    expect(isReviewing()).toBe(true);
    closeAgain();
  });
});
