import { useEffect, useState } from "react";

/*
 * Thème clair / sombre.
 *
 * Trois états possibles en mémoire : "clair", "sombre", ou rien — auquel cas on
 * suit la préférence du système. Dès que l'utilisateur bascule, son choix est
 * enregistré et prime sur le système.
 */

const KEY = "flash.theme";

const prefereSombre = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

export function themeInitial() {
  const choix = localStorage.getItem(KEY);
  return choix === "dark" || choix === "light" ? choix : (prefereSombre() ? "dark" : "light");
}

function appliquer(theme) {
  const html = document.documentElement;
  html.classList.toggle("dark", theme === "dark");
  // Indique au navigateur d'assortir les éléments natifs (barres de défilement,
  // champs de formulaire) au thème courant.
  html.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#020617" : "#7c3aed");
}

export function useTheme() {
  const [theme, setTheme] = useState(themeInitial);

  useEffect(() => {
    appliquer(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // Sans choix explicite enregistré, un changement de réglage système suit.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return undefined;
    const onChange = (e) => {
      if (!localStorage.getItem(KEY)) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
