import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installTestHarness } from "./lib/testHarness";
import "./index.css";

const isSelfTest = import.meta.env.DEV || import.meta.env.VITE_SELFTEST === "true";

if (isSelfTest) installTestHarness();
if (isSelfTest) {
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
