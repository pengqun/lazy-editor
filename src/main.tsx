import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installTestHarness } from "./lib/testHarness";
import "./index.css";

async function runSelfTestFromCli() {
  // Only relevant in desktop (Tauri) runtime
  if (!(window as any).__TAURI__) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const params = await invoke<{ workspace: string | null; self_test: string | null }>("get_startup_params");
    if (params?.self_test !== "editor") return;

    const api = (window as any).__LAZY_TEST__ as any;
    if (!api) throw new Error("__LAZY_TEST__ not installed");

    // Wait until the TipTap editor instance is ready (installed into the store)
    const start = Date.now();
    while (Date.now() - start < 10_000) {
      const html = api.getHtml?.();
      if (typeof html === "string") break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Ensure workspace is set and create a smoke file path
    const ws = params.workspace;
    if (!ws) throw new Error("workspace not set (pass --workspace)");
    const path = `${ws}/__smoke__/editor.md`;

    // Create initial file content via backend save_file
    await invoke("save_file", { path, content: "<p>smoke</p>" });
    await api.openByPath(path);

    // Apply some formatting and save
    api.selectAll();
    api.toggleHeading(1);
    api.selectAll();
    api.toggleBold();
    await api.save();

    const saved = await invoke<string>("open_file", { path });
    if (!saved.includes("<h1") || !saved.includes("<strong")) {
      throw new Error(`self-test failed: unexpected saved content: ${saved.slice(0, 200)}`);
    }

    await invoke("exit_app", { code: 0 });
  } catch (e: any) {
    console.error("SELF_TEST_ERROR", e);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("exit_app", { code: 1 });
    } catch {}
  }
}


if (import.meta.env.DEV) installTestHarness();
if (import.meta.env.DEV) {
  const schedule = () => setTimeout(() => runSelfTestFromCli(), 300);
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
