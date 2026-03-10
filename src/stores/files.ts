import { clearDraft } from "@/lib/recovery";
import { criticalAlert } from "@/stores/alert";
import { useKnowledgeStore } from "@/stores/knowledge";
import { useRecoveryStore } from "@/stores/recovery";
import { useSnapshotsStore } from "@/stores/snapshots";
import { toast } from "@/stores/toast";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  modified: number;
}

interface FilesState {
  workspacePath: string | null;
  setWorkspacePath: (path: string) => void;

  files: FileEntry[];
  setFiles: (files: FileEntry[]) => void;
  loadWorkspace: () => Promise<void>;

  activeFilePath: string | null;
  activeFileContent: string;
  setActiveFile: (path: string, content: string) => void;

  isDirty: boolean;
  setDirty: (dirty: boolean) => void;

  openFile: (path: string) => Promise<void>;
  openFileByPath: (path: string) => Promise<void>;
  saveFile: () => Promise<void>;
  createFile: (name: string) => Promise<void>;
}

export const useFilesStore = create<FilesState>((set, get) => ({
  workspacePath: null,
  setWorkspacePath: (path) => set({ workspacePath: path }),

  files: [],
  setFiles: (files) => set({ files }),

  loadWorkspace: async () => {
    try {
      const result = await invoke<{ path: string; files: FileEntry[] }>("get_workspace");
      set({ workspacePath: result.path, files: result.files });
    } catch {
      // Workspace not set yet — first run
    }
  },

  activeFilePath: null,
  activeFileContent: "",
  setActiveFile: (path, content) =>
    set({ activeFilePath: path, activeFileContent: content, isDirty: false }),

  isDirty: false,
  setDirty: (dirty) => set({ isDirty: dirty }),

  openFile: async (path) => {
    try {
      const { activeFilePath: currentPath, isDirty } = get();
      if (isDirty && currentPath && currentPath !== path) {
        await get().saveFile();
      }
      const content = await invoke<string>("open_file", { path });
      set({
        activeFilePath: path,
        activeFileContent: content,
        isDirty: false,
      });
      // Restore per-document retrieval settings
      useKnowledgeStore.getState().restoreForDocument(path);
      // Check for crash-recovery draft
      useRecoveryStore.getState().checkOnOpen(path, content);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  },

  openFileByPath: async (path) => {
    try {
      const { activeFilePath: currentPath, isDirty } = get();
      if (isDirty && currentPath && currentPath !== path) {
        await get().saveFile();
      }
      const content = await invoke<string>("open_file_by_path", { path });
      set({ activeFilePath: path, activeFileContent: content, isDirty: false });
      // Restore per-document retrieval settings
      useKnowledgeStore.getState().restoreForDocument(path);
      // Check for crash-recovery draft
      useRecoveryStore.getState().checkOnOpen(path, content);
    } catch (err) {
      console.error("Failed to open file by path:", err);
    }
  },

  saveFile: async () => {
    const { activeFilePath, activeFileContent } = get();
    if (!activeFilePath) return;
    try {
      await invoke("save_file", {
        path: activeFilePath,
        content: activeFileContent,
      });
      set({ isDirty: false });
      clearDraft(activeFilePath);
      // Fire-and-forget auto-snapshot after successful save
      useSnapshotsStore.getState().autoSnapshot(activeFilePath, activeFileContent);
    } catch (err) {
      console.error("Failed to save file:", err);
      toast.error(`Failed to save file: ${err}`);
      criticalAlert.show({
        title: "File Save Failed",
        message: `Could not save "${activeFilePath.split("/").pop()}". Your changes may be lost. Error: ${err}`,
        actions: [
          { label: "Dismiss", variant: "secondary", onClick: () => {} },
          { label: "Retry", variant: "primary", onClick: () => get().saveFile() },
        ],
      });
    }
  },

  createFile: async (name) => {
    const { workspacePath, loadWorkspace, openFile } = get();
    if (!workspacePath) return;
    const path = `${workspacePath}/${name}`;
    try {
      await invoke("save_file", { path, content: `# ${name.replace(".md", "")}\n\n` });
      await loadWorkspace();
      await openFile(path);
    } catch (err) {
      console.error("Failed to create file:", err);
      toast.error(`Failed to create file: ${err}`);
    }
  },
}));
