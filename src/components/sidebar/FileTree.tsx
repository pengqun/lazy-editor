import { FileText, FolderOpen, Link2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { openFolderDialog, setWorkspacePath } from "../../lib/tauri";
import { useFilesStore } from "../../stores/files";

export function FileTree() {
  const files = useFilesStore((s) => s.files);
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const openFile = useFilesStore((s) => s.openFile);
  const createFile = useFilesStore((s) => s.createFile);
  const openFileByPath = useFilesStore((s) => s.openFileByPath);
  const loadWorkspace = useFilesStore((s) => s.loadWorkspace);
  const workspacePath = useFilesStore((s) => s.workspacePath);

  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) {
      newFileInputRef.current?.focus();
    }
  }, [isCreating]);

  const handleChooseFolder = async () => {
    const path = await openFolderDialog();
    if (path) {
      await setWorkspacePath(path);
      await loadWorkspace();
    }
  };

  const handleOpenByPath = async () => {
    const input = window.prompt("Open file by path (must be inside current workspace):");
    if (!input) return;
    await openFileByPath(input);
  };

  const handleCreate = () => {
    if (!newFileName.trim()) {
      setIsCreating(false);
      return;
    }
    const name = newFileName.endsWith(".md") ? newFileName : `${newFileName}.md`;
    createFile(name);
    setIsCreating(false);
    setNewFileName("");
  };

  if (!workspacePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <FolderOpen size={32} className="text-text-tertiary mb-3" />
        <p className="text-sm text-text-secondary mb-3">No workspace open</p>
        <button
          type="button"
          onClick={handleChooseFolder}
          className="px-3 py-1.5 bg-accent text-white rounded text-xs hover:bg-accent/80 transition-colors"
        >
          Open Folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-text-tertiary uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenByPath}
            className="p-0.5 hover:bg-surface-3 rounded transition-colors"
            title="Open by path…"
          >
            <Link2 size={14} className="text-text-tertiary" />
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="p-0.5 hover:bg-surface-3 rounded transition-colors"
            title="New document"
          >
            <Plus size={14} className="text-text-tertiary" />
          </button>
        </div>
      </div>

      {isCreating && (
        <div className="px-3 py-1">
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setIsCreating(false);
            }}
            onBlur={handleCreate}
            placeholder="filename.md"
            ref={newFileInputRef}
            className="w-full bg-surface-3 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {files
        .filter((f) => !f.isDir && f.name.endsWith(".md"))
        .sort((a, b) => b.modified - a.modified)
        .map((file) => (
          <button
            type="button"
            key={file.path}
            onClick={() => openFile(file.path)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
              activeFilePath === file.path
                ? "bg-accent/15 text-accent"
                : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
            )}
          >
            <FileText size={14} className="flex-shrink-0" />
            <span className="truncate">{file.name}</span>
          </button>
        ))}
    </div>
  );
}
