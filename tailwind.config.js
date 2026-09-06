/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  // Le thème est piloté par une classe sur <html> (voir src/lib/theme.js) plutôt
  // que par la préférence système seule : le choix de l'utilisateur prime.
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
