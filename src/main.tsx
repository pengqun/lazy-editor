import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installTestHarness } from "./lib/testHarness";
import "./index.css";

if (import.meta.env.DEV) installTestHarness();
if (import.meta.env.DEV) {
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
