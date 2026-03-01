import { useEffect } from "react";
import { FileTree } from "./components/sidebar/FileTree";
import { Editor } from "./components/editor/Editor";
import { Toolbar } from "./components/editor/Toolbar";
import { StatusBar } from "./components/editor/StatusBar";
import { KnowledgePanel } from "./components/sidebar/KnowledgePanel";
import { CommandPalette } from "./components/panels/CommandPalette";
import { AIToolbar } from "./components/editor/AIToolbar";
import { useEditorStore } from "./stores/editor";
import { useFilesStore } from "./stores/files";

export default function App() {
  const showCommandPalette = useEditorStore((s) => s.showCommandPalette);
  const setShowCommandPalette = useEditorStore((s) => s.setShowCommandPalette);
  const rightPanel = useEditorStore((s) => s.rightPanel);
  const loadWorkspace = useFilesStore((s) => s.loadWorkspace);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette(!showCommandPalette);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showCommandPalette, setShowCommandPalette]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0">
      {/* Left Sidebar — File Tree */}
      <div className="w-60 flex-shrink-0 border-r border-border bg-surface-1 flex flex-col">
        <div className="h-10 flex items-center px-4 border-b border-border">
          <span className="text-sm font-semibold text-text-secondary tracking-wide">
            LAZY EDITOR
          </span>
        </div>
        <FileTree />
      </div>

      {/* Center — Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar />
        <div className="flex-1 overflow-y-auto relative">
          <Editor />
          <AIToolbar />
        </div>
        <StatusBar />
      </div>

      {/* Right Sidebar — Knowledge / AI Context */}
      {rightPanel && (
        <div className="w-80 flex-shrink-0 border-l border-border bg-surface-1 flex flex-col">
          <KnowledgePanel />
        </div>
      )}

      {/* Command Palette Overlay */}
      {showCommandPalette && (
        <CommandPalette onClose={() => setShowCommandPalette(false)} />
      )}
    </div>
  );
}
