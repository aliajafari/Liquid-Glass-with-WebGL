import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/schibsted-grotesk/400.css";
import "@fontsource/schibsted-grotesk/500.css";
import "@fontsource/schibsted-grotesk/700.css";
import "@fontsource/schibsted-grotesk/800.css";
import "@fontsource/jetbrains-mono/400.css";
import { App } from "./App";
import "./styles.css";

// The glass captures the page once it mounts, so wait for the web fonts first;
// otherwise the refracted copy would show the fallback font.
const fontsReady = document.fonts?.ready ?? Promise.resolve();
void Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
