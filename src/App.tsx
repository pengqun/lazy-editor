import { invoke } from "@tauri-apps/api/core";
import { Activity, Settings } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { CriticalAlert } from "./components/CriticalAlert";
import { ToastContainer } from "./components/Toast";
import { FindReplaceBar } from "./components/editor/FindReplaceBar";
import { OutlinePanel } from "./components/editor/OutlinePanel";
import { StatusBar } from "./components/editor/StatusBar";
import { Toolbar } from "./components/editor/Toolbar";
import { FileTree } from "./components/sidebar/FileTree";
import { exportEditorToHtml } from "./lib/export-html";
import { exportEditorToMarkdown } from "./lib/export-markdown";
import { exportEditorToPdf } from "./lib/export-pdf";
import { modKey } from "./lib/shortcuts";
import { openFolderDialog, setWorkspacePath } from "./lib/tauri";
import { checkForAppUpdate } from "./lib/updater";
import { useAiStore } from "./stores/ai";
import { useAppShellStore } from "./stores/appShell";
import { useEditorStore } from "./stores/editor";
import { useFilesStore } from "./stores/files";
import { useKnowledgeStore } from "./stores/knowledge";
import { useRecoveryStore } from "./stores/recovery";
import { toast } from "./stores/toast";

const Editor = lazy(() =>
  import("./components/editor/Editor").then((m) => ({ default: m.Editor })),
);
const KnowledgePanel = lazy(() =>
  import("./components/sidebar/KnowledgePanel").then((m) => ({
    default: m.KnowledgePanel,
  })),
);
const CommandPalette = lazy(() =>
  import("./components/panels/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);
const SettingsPanel = lazy(() =>
  import("./components/panels/SettingsPanel").then((m) => ({
    default: m.SettingsPanel,
  })),
);
const ShortcutHelpPanel = lazy(() =>
  import("./components/panels/ShortcutHelpPanel").then((m) => ({
    default: m.ShortcutHelpPanel,
  })),
);
const RecoveryDialog = lazy(() =>
  import("./components/panels/RecoveryDialog").then((m) => ({
    default: m.RecoveryDialog,
  })),
);
const VersionHistoryPanel = lazy(() =>
  import("./components/panels/VersionHistoryPanel").then((m) => ({
    default: m.VersionHistoryPanel,
  })),
);
const DiagnosticsPanel = lazy(() =>
  import("./components/panels/DiagnosticsPanel").then((m) => ({
    default: m.DiagnosticsPanel,
  })),
);

export default function App() {
  const showCommandPalette = useEditorStore((s) => s.showCommandPalette);
  const setShowCommandPalette = useEditorStore((s) => s.setShowCommandPalette);
  const showShortcutHelp = useEditorStore((s) => s.showShortcutHelp);
  const setShowShortcutHelp = useEditorStore((s) => s.setShowShortcutHelp);
  const showFindReplace = useEditorStore((s) => s.showFindReplace);
  const showOutline = useEditorStore((s) => s.showOutline);
  const showVersionHistory = useEditorStore((s) => s.showVersionHistory);
  const setShowVersionHistory = useEditorStore((s) => s.setShowVersionHistory);
  const rightPanel = useEditorStore((s) => s.rightPanel);
  const setRightPanel = useEditorStore((s) => s.setRightPanel);
  const showRecoveryDialog = useRecoveryStore((s) => s.showRecoveryDialog);
  const loadWorkspace = useFilesStore((s) => s.loadWorkspace);
  const workspacePath = useFilesStore((s) => s.workspacePath);
  const aiSettings = useAiStore((s) => s.settings);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const appPhase = useAppShellStore((s) => s.phase);
  const appShellError = useAppShellStore((s) => s.error);
  const setAppShellPhase = useAppShellStore((s) => s.setPhase);
  const setAppShellError = useAppShellStore((s) => s.setError);
  const bootStarted = useRef(false);

  // Load workspace + AI settings on mount; detect first-run; fail closed on hung IPC
  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;

    const LOAD_TIMEOUT_MS = 12_000;
    let finished = false;

    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      setAppShellError(
        import.meta.env.DEV
          ? "Startup is taking longer than expected."
          : "The editor did not finish loading in time. If this persists after a restart, capture WebKit console output from the Diagnostics panel.",
      );
      setAppShellPhase("error");
    }, LOAD_TIMEOUT_MS);

    const markReady = () => {
      finished = true;
      window.clearTimeout(timeoutId);
      setAppShellPhase("ready");
    };

    const markFailed = (message: string) => {
      finished = true;
      window.clearTimeout(timeoutId);
      setAppShellError(message);
      setAppShellPhase("error");
    };

    const init = async () => {
      try {
        await loadWorkspace();
        await useAiStore.getState().loadSettings();

        try {
          const BACKEND_PING_MS = 8000;
          await Promise.race([
            invoke("get_startup_params"),
            new Promise<never>((_, rej) =>
              setTimeout(
                () => rej(new Error("Native backend did not respond in time")),
                BACKEND_PING_MS,
              ),
            ),
          ]);
        } catch (err) {
          markFailed(
            `Cannot reach the native backend (${String(err)}). The UI cannot load safely.`,
          );
          return;
        }

        const ws = useFilesStore.getState().workspacePath;
        useKnowledgeStore.getState().setWorkspacePath(ws);
        const { claudeApiKey, openaiApiKey, provider } = useAiStore.getState().settings;
        const hasApiKey =
          provider === "ollama" ||
          (provider === "claude" && claudeApiKey.length > 0) ||
          (provider === "openai" && openaiApiKey.length > 0);

        if (!ws && !hasApiKey) {
          setShowOnboarding(true);
        }

        void checkForAppUpdate().catch((e) => {
          console.warn("[updater] startup check skipped:", e);
        });
        markReady();
      } catch (err) {
        markFailed(`Startup failed: ${String(err)}`);
      }
    };

    void init();
    return () => {
      finished = true;
      window.clearTimeout(timeoutId);
    };
  }, [loadWorkspace, setAppShellError, setAppShellPhase]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    // Cmd+F — Find & Replace
    if (e.key === "f" && !e.shiftKey) {
      e.preventDefault();
      const { showFindReplace: open, setShowFindReplace: setOpen } = useEditorStore.getState();
      setOpen(!open);
      return;
    }

    // Cmd+K — Command palette
    if (e.key === "k") {
      e.preventDefault();
      const { showCommandPalette: open, setShowCommandPalette: setOpen } =
        useEditorStore.getState();
      setOpen(!open);
      return;
    }

    // Cmd+Shift+O — Toggle outline
    if (e.shiftKey && e.key === "o") {
      e.preventDefault();
      const { showOutline: open, setShowOutline: setOpen } = useEditorStore.getState();
      setOpen(!open);
      return;
    }

    // Cmd+Shift+V — Version History
    if (e.shiftKey && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      const { showVersionHistory: open, setShowVersionHistory: setOpen } =
        useEditorStore.getState();
      setOpen(!open);
      return;
    }

    // Cmd+Shift+E — Export markdown
    if (e.shiftKey && e.key === "e") {
      e.preventDefault();
      const editor = useEditorStore.getState().editor;
      if (editor)
        exportEditorToMarkdown(editor).then((p) => p && toast.success("Exported as Markdown"));
      return;
    }

    // Cmd+Shift+H — Export HTML
    if (e.shiftKey && e.key === "h") {
      e.preventDefault();
      const editor = useEditorStore.getState().editor;
      if (editor)
        exportEditorToHtml(editor)
          .then((p) => p && toast.success("Exported as HTML"))
          .catch(() => toast.error("HTML export failed"));
      return;
    }

    // Cmd+Shift+P — Export PDF (print dialog)
    if (e.shiftKey && e.key === "p") {
      e.preventDefault();
      const editor = useEditorStore.getState().editor;
      if (editor) {
        try {
          exportEditorToPdf(editor);
          toast.info("Print dialog opened — choose Save as PDF");
        } catch {
          toast.error("PDF export failed");
        }
      }
      return;
    }

    // Cmd+S — Save file
    if (e.key === "s" && !e.shiftKey) {
      e.preventDefault();
      const { activeFilePath, saveFile } = useFilesStore.getState();
      if (activeFilePath) {
        saveFile().then(() => toast.success("File saved"));
      }
      return;
    }

    // Cmd+N — New file
    if (e.key === "n" && !e.shiftKey) {
      e.preventDefault();
      const ws = useFilesStore.getState().workspacePath;
      if (!ws) {
        toast.error("Open a workspace first");
        return;
      }
      const name = window.prompt("New file name:", "untitled.md");
      if (name) {
        const fileName = name.endsWith(".md") ? name : `${name}.md`;
        useFilesStore.getState().createFile(fileName);
      }
      return;
    }

    // Cmd+O — Open folder
    if (e.key === "o" && !e.shiftKey) {
      e.preventDefault();
      openFolderDialog().then(async (path) => {
        if (path) {
          await setWorkspacePath(path);
          await useFilesStore.getState().loadWorkspace();
          useKnowledgeStore.getState().setWorkspacePath(path);
          toast.success("Workspace opened");
        }
      });
      return;
    }

    // Cmd+, — Settings
    if (e.key === ",") {
      e.preventDefault();
      setShowSettings(true);
      return;
    }

    // Cmd+/ — Shortcut help
    if (e.key === "/") {
      e.preventDefault();
      const { showShortcutHelp: open, setShowShortcutHelp: setOpen } = useEditorStore.getState();
      setOpen(!open);
      return;
    }

    // Cmd+Shift+D — Diagnostics
    if (e.shiftKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      setShowDiagnostics((prev) => !prev);
      return;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const hasApiKey =
    aiSettings.provider === "ollama" ||
    (aiSettings.provider === "claude" && aiSettings.claudeApiKey.length > 0) ||
    (aiSettings.provider === "openai" && aiSettings.openaiApiKey.length > 0);

  // First-run onboarding
  const handleOnboardingChooseFolder = async () => {
    const path = await openFolderDialog();
    if (path) {
      await setWorkspacePath(path);
      await useFilesStore.getState().loadWorkspace();
      useKnowledgeStore.getState().setWorkspacePath(path);
      toast.success("Workspace opened");
    }
  };

  const handleOnboardingOpenKnowledge = () => {
    setRightPanel("knowledge");
    setShowOnboarding(false);
  };

  const handleOnboardingFinish = () => {
    setShowOnboarding(false);
    if (!hasApiKey) {
      setShowSettings(true);
    }
  };

  if (appPhase === "loading") {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ background: "var(--surface-0)", color: "var(--text-secondary)" }}
      >
        <div className="text-center text-sm">Starting Lazy Editor…</div>
      </div>
    );
  }

  if (appPhase === "error") {
    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center gap-4 px-8 text-center"
        style={{ background: "var(--surface-0)", color: "var(--text-primary)" }}
      >
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Lazy Editor could not start
        </h1>
        <p className="max-w-md text-sm" style={{ color: "var(--text-secondary)" }}>
          {appShellError ?? "An unexpected error occurred during startup."}
        </p>
        <p className="max-w-md text-xs" style={{ color: "var(--text-tertiary)" }}>
          Open Diagnostics ({modKey}⇧D) for details, or restart the app. Knowledge Base features
          stay unavailable when the embedding model cannot load; that is separate from this screen.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0">
      {/* Left Sidebar — File Tree */}
      <div className="w-60 flex-shrink-0 border-r border-border bg-surface-1 flex flex-col">
        <div className="h-10 flex items-center justify-between px-4 border-b border-border">
          <span className="text-sm font-semibold text-text-secondary tracking-wide">
            LAZY EDITOR
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              className="p-1 hover:bg-surface-3 rounded transition-colors"
              title={`Diagnostics (${modKey}⇧D)`}
            >
              <Activity size={14} className="text-text-tertiary" />
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="p-1 hover:bg-surface-3 rounded transition-colors"
              title={`AI Settings (${modKey},)`}
            >
              <Settings size={14} className="text-text-tertiary" />
            </button>
          </div>
        </div>
        <FileTree />
      </div>

      {/* Center — Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar />
        {showFindReplace && <FindReplaceBar />}
        <div className="flex-1 flex min-h-0">
          {showOutline && <OutlinePanel />}
          <div className="flex-1 overflow-y-auto relative">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-text-tertiary text-sm">
                  Loading editor…
                </div>
              }
            >
              <Editor />
            </Suspense>
          </div>
        </div>
        <StatusBar />
      </div>

      {/* Right Sidebar — Knowledge / AI Context */}
      {rightPanel && (
        <div className="w-80 flex-shrink-0 border-l border-border bg-surface-1 flex flex-col">
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-text-tertiary text-sm">
                Loading panel…
              </div>
            }
          >
            <KnowledgePanel />
          </Suspense>
        </div>
      )}

      {/* Command Palette Overlay */}
      {showCommandPalette && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setShowCommandPalette(false)} />
        </Suspense>
      )}

      {/* Settings Panel Overlay */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </Suspense>
      )}

      {/* Shortcut Help Panel */}
      {showShortcutHelp && (
        <Suspense fallback={null}>
          <ShortcutHelpPanel onClose={() => setShowShortcutHelp(false)} />
        </Suspense>
      )}

      {/* Version History Panel */}
      {showVersionHistory && (
        <Suspense fallback={null}>
          <VersionHistoryPanel onClose={() => setShowVersionHistory(false)} />
        </Suspense>
      )}

      {/* Diagnostics Panel */}
      {showDiagnostics && (
        <Suspense fallback={null}>
          <DiagnosticsPanel onClose={() => setShowDiagnostics(false)} />
        </Suspense>
      )}

      {/* First-Run Onboarding Overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-[520px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-lg font-semibold text-text-primary">Welcome to Lazy Editor</h2>
              <p className="text-sm text-text-secondary mt-2">
                Core flow: write with AI, ground answers with your Knowledge Base, and ship faster.
              </p>
            </div>

            <div className="px-6 py-4 space-y-2">
              <div className="flex items-center justify-between text-xs rounded-lg border border-border bg-surface-1 px-3 py-2">
                <span className="text-text-secondary">1) Choose workspace folder</span>
                <span className={workspacePath ? "text-emerald-400" : "text-text-tertiary"}>
                  {workspacePath ? "Done" : "Pending"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs rounded-lg border border-border bg-surface-1 px-3 py-2">
                <span className="text-text-secondary">2) Configure AI provider</span>
                <span className={hasApiKey ? "text-emerald-400" : "text-text-tertiary"}>
                  {hasApiKey ? "Done" : "Pending"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs rounded-lg border border-border bg-surface-1 px-3 py-2">
                <span className="text-text-secondary">3) Import first KB document</span>
                <span className="text-text-tertiary">Recommended</span>
              </div>
            </div>

            <div className="px-6 pb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOnboardingChooseFolder}
                className="text-sm px-3 py-2.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                Choose Workspace
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-sm px-3 py-2.5 rounded-lg border border-border text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Configure AI
              </button>
              <button
                type="button"
                onClick={handleOnboardingOpenKnowledge}
                className="text-sm px-3 py-2.5 rounded-lg border border-border text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Open Knowledge Base
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOnboarding(false);
                  setShowCommandPalette(true);
                }}
                className="text-sm px-3 py-2.5 rounded-lg border border-border text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Try AI ({modKey}K)
              </button>
            </div>

            <div className="px-6 pb-4 flex justify-end">
              <button
                type="button"
                onClick={handleOnboardingFinish}
                className="text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crash Recovery Dialog */}
      {showRecoveryDialog && (
        <Suspense fallback={null}>
          <RecoveryDialog />
        </Suspense>
      )}

      {/* Critical Alert Dialog */}
      <CriticalAlert />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
