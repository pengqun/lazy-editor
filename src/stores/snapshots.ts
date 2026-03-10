import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { toast } from "./toast";

export interface Snapshot {
  id: number;
  filePath: string;
  preview: string;
  contentLength: number;
  createdAt: string;
}

interface SnapshotsState {
  snapshots: Snapshot[];
  isLoading: boolean;
  lastAutoSnapshotTime: Record<string, number>;

  loadSnapshots: (filePath: string) => Promise<void>;
  createSnapshot: (filePath: string, content: string) => Promise<void>;
  autoSnapshot: (filePath: string, content: string) => Promise<void>;
  restoreSnapshot: (id: number) => Promise<string | null>;
  deleteSnapshot: (id: number, filePath: string) => Promise<void>;
}

const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const useSnapshotsStore = create<SnapshotsState>((set, get) => ({
  snapshots: [],
  isLoading: false,
  lastAutoSnapshotTime: {},

  loadSnapshots: async (filePath) => {
    set({ isLoading: true });
    try {
      const snapshots = await invoke<Snapshot[]>("list_snapshots", { filePath });
      set({ snapshots });
    } catch (err) {
      console.error("Failed to load snapshots:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  createSnapshot: async (filePath, content) => {
    try {
      const id = await invoke<number | null>("create_snapshot", { filePath, content });
      if (id !== null) {
        toast.success("Snapshot saved");
        await get().loadSnapshots(filePath);
        set((state) => ({
          lastAutoSnapshotTime: { ...state.lastAutoSnapshotTime, [filePath]: Date.now() },
        }));
      } else {
        toast.info("No changes to snapshot");
      }
    } catch (err) {
      console.error("Failed to create snapshot:", err);
      toast.error(`Snapshot failed: ${err}`);
    }
  },

  autoSnapshot: async (filePath, content) => {
    const { lastAutoSnapshotTime } = get();
    const lastTime = lastAutoSnapshotTime[filePath] ?? 0;
    if (Date.now() - lastTime < AUTO_SNAPSHOT_INTERVAL_MS) return;

    try {
      const id = await invoke<number | null>("create_snapshot", { filePath, content });
      if (id !== null) {
        set((state) => ({
          lastAutoSnapshotTime: { ...state.lastAutoSnapshotTime, [filePath]: Date.now() },
        }));
        // Silently refresh the list if panel is open
        await get().loadSnapshots(filePath);
      }
    } catch (err) {
      console.error("Auto-snapshot failed:", err);
    }
  },

  restoreSnapshot: async (id) => {
    try {
      const content = await invoke<string>("get_snapshot_content", { id });
      return content;
    } catch (err) {
      console.error("Failed to get snapshot content:", err);
      toast.error(`Failed to restore snapshot: ${err}`);
      return null;
    }
  },

  deleteSnapshot: async (id, filePath) => {
    try {
      await invoke("delete_snapshot", { id });
      await get().loadSnapshots(filePath);
    } catch (err) {
      console.error("Failed to delete snapshot:", err);
      toast.error(`Failed to delete snapshot: ${err}`);
    }
  },
}));
