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
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const params = await invoke<{ workspace: string | null; self_test: string | null }>("get_startup_params");
    if (!params?.self_test) return;

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
    while (Date.now() - start < 10_000) {
      const html = api.getHtml?.();
      if (typeof html === "string") break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const workspace = params.workspace;
    if (!workspace) throw new Error("workspace not set (pass --workspace)");

    await testFn({ api, invoke, workspace });
    await invoke("exit_app", { code: 0 });
  } catch (e: any) {
    console.error("SELF_TEST_ERROR", e);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("exit_app", { code: 1 });
    } catch {}
  }
}
