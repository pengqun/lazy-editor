import type { LazyTestApi } from "../lib/testHarness";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { editorBasic } from "./editorBasic";
import { editorUndoRedo } from "./editorUndoRedo";
import { editorFormatting } from "./editorFormatting";

export type TestContext = {
  api: LazyTestApi;
  invoke: <T>(cmd: string, args?: InvokeArgs) => Promise<T>;
  workspace: string;
};

export type TestFn = (ctx: TestContext) => Promise<void>;

const tests: Record<string, TestFn> = {
  "editor-basic": editorBasic,
  "editor-undo-redo": editorUndoRedo,
  "editor-formatting": editorFormatting,
  "editor": editorBasic, // backward-compat alias
};

export async function runSelfTest() {
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const params = await invoke<{ workspace: string | null; self_test: string | null }>("get_startup_params");
    if (!params?.self_test) return;

    // JS-side deadline: exit after 60s no matter what
    deadlineTimer = setTimeout(async () => {
      console.error("[selftest] FATAL: JS deadline timeout (60s)");
      try {
        await invoke("exit_app", { code: 1 });
      } catch {}
    }, 60_000);

    const testName = params.self_test;
    const testFn = tests[testName];
    if (!testFn) {
      const available = Object.keys(tests).join(", ");
      console.error(`Unknown self-test "${testName}". Available tests: ${available}`);
      await invoke("exit_app", { code: 1 });
      return;
    }

    const api = (window as any).__LAZY_TEST__ as LazyTestApi | undefined;
    if (!api) throw new Error("__LAZY_TEST__ not installed");

    // Wait until the TipTap editor instance is ready
    const start = Date.now();
    let editorReady = false;
    while (Date.now() - start < 10_000) {
      const html = api.getHtml?.();
      if (html !== null) {
        editorReady = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    if (!editorReady) {
      throw new Error("Editor not ready after 10s");
    }

    const workspace = params.workspace;
    if (!workspace) throw new Error("workspace not set (pass --workspace)");

    await testFn({ api, invoke, workspace });
    clearTimeout(deadlineTimer);
    await invoke("exit_app", { code: 0 });
  } catch (e: any) {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    console.error("SELF_TEST_ERROR", e);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("exit_app", { code: 1 });
    } catch {}
  }
}
