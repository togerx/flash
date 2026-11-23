import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import UpdatePrompt from "./components/UpdatePrompt.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    {/* Hors de App : le bandeau de mise à jour vaut pour tous les écrans,
        y compris la connexion. */}
    <UpdatePrompt />
  </StrictMode>
);
