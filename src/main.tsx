import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { restoreInstallBridgeFromCookie, syncInstallBridgeFromDb } from "./db/install-bridge";
import { isStandaloneDisplay, needsInstallGate, requestPersistentStorage } from "./lib/pwa-install";
import "./app.css";

registerSW({ immediate: true });

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

async function start() {
  try {
    if (isStandaloneDisplay()) {
      await restoreInstallBridgeFromCookie();
      void requestPersistentStorage();
    } else if (needsInstallGate()) {
      // Finish writing the bridge before showing installation instructions, so
      // an immediate "Add to Home Screen" already carries current progress.
      await syncInstallBridgeFromDb();
    }
  } catch {
    // Installation protection must never turn a recoverable storage problem
    // into a blank screen. The normal app can still surface its own DB errors.
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void start();
