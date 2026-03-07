import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installTestHarness } from "./lib/testHarness";
import "./index.css";

const isSelfTest =
  import.meta.env.DEV ||
  import.meta.env.MODE === "selftest" ||
  import.meta.env.VITE_SELFTEST === "true";

if (isSelfTest) installTestHarness();
if (isSelfTest) {
  // Diagnose whether the webview/IPC is alive in selftest mode
  (async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("selftest_ping", { message: "frontend boot" });
    } catch {}
  })();

  const schedule = async () => {
    const { runSelfTest } = await import("./selfTests");
    setTimeout(() => runSelfTest(), 300);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", () => schedule(), { once: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
