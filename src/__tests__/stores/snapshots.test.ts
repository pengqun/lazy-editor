import { useSnapshotsStore } from "@/stores/snapshots";
import { useToastStore } from "@/stores/toast";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedInvoke = vi.mocked(invoke);

function resetStore() {
  useSnapshotsStore.setState({
    snapshots: [],
    isLoading: false,
    lastAutoSnapshotTime: {},
  });
  useToastStore.setState({ toasts: [] });
}

describe("useSnapshotsStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useSnapshotsStore.getState();
    expect(state.snapshots).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.lastAutoSnapshotTime).toEqual({});
  });

  it("loadSnapshots calls invoke and sets snapshots", async () => {
    const snaps = [
      {
        id: 1,
        filePath: "/ws/doc.md",
        preview: "hello...",
        contentLength: 500,
        createdAt: "2026-01-01 12:00:00",
      },
    ];
    mockedInvoke.mockResolvedValueOnce(snaps);

    await useSnapshotsStore.getState().loadSnapshots("/ws/doc.md");

    expect(mockedInvoke).toHaveBeenCalledWith("list_snapshots", {
      filePath: "/ws/doc.md",
    });
    expect(useSnapshotsStore.getState().snapshots).toEqual(snaps);
    expect(useSnapshotsStore.getState().isLoading).toBe(false);
  });

  it("loadSnapshots sets isLoading during fetch", async () => {
    let resolveInvoke: (v: unknown) => void;
    mockedInvoke.mockReturnValueOnce(
      new Promise((r) => {
        resolveInvoke = r;
      }),
    );

    const promise = useSnapshotsStore.getState().loadSnapshots("/ws/doc.md");
    expect(useSnapshotsStore.getState().isLoading).toBe(true);

    resolveInvoke!([]);
    await promise;
    expect(useSnapshotsStore.getState().isLoading).toBe(false);
  });

  it("createSnapshot calls invoke with filePath and content", async () => {
    mockedInvoke
      .mockResolvedValueOnce(42) // create_snapshot
      .mockResolvedValueOnce([]); // list_snapshots reload

    await useSnapshotsStore.getState().createSnapshot("/ws/doc.md", "content");

    expect(mockedInvoke).toHaveBeenCalledWith("create_snapshot", {
      filePath: "/ws/doc.md",
      content: "content",
    });
  });

  it("createSnapshot shows success toast when new snapshot created", async () => {
    mockedInvoke.mockResolvedValueOnce(1).mockResolvedValueOnce([]);

    await useSnapshotsStore.getState().createSnapshot("/ws/doc.md", "content");

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.type === "success" && t.message.includes("Snapshot saved"))).toBe(
      true,
    );
  });

  it("createSnapshot shows info toast when content unchanged", async () => {
    mockedInvoke.mockResolvedValueOnce(null);

    await useSnapshotsStore.getState().createSnapshot("/ws/doc.md", "unchanged");

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.type === "info" && t.message.includes("No changes"))).toBe(true);
  });

  it("autoSnapshot respects 5-minute rate limit", async () => {
    mockedInvoke.mockResolvedValueOnce(1).mockResolvedValueOnce([]);

    await useSnapshotsStore.getState().autoSnapshot("/ws/doc.md", "v1");
    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();

    // Second call within 5 minutes should be skipped
    await useSnapshotsStore.getState().autoSnapshot("/ws/doc.md", "v2");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("autoSnapshot updates lastAutoSnapshotTime on success", async () => {
    mockedInvoke.mockResolvedValueOnce(1).mockResolvedValueOnce([]);

    await useSnapshotsStore.getState().autoSnapshot("/ws/doc.md", "v1");

    const lastTime = useSnapshotsStore.getState().lastAutoSnapshotTime["/ws/doc.md"];
    expect(lastTime).toBeDefined();
    expect(lastTime).toBeGreaterThan(0);
  });

  it("autoSnapshot skips update when content unchanged", async () => {
    mockedInvoke.mockResolvedValueOnce(null); // create_snapshot returns null (dedup)

    await useSnapshotsStore.getState().autoSnapshot("/ws/doc.md", "same");

    const lastTime = useSnapshotsStore.getState().lastAutoSnapshotTime["/ws/doc.md"];
    expect(lastTime).toBeUndefined();
  });

  it("restoreSnapshot calls invoke and returns content", async () => {
    mockedInvoke.mockResolvedValueOnce("restored content");

    const content = await useSnapshotsStore.getState().restoreSnapshot(5);

    expect(mockedInvoke).toHaveBeenCalledWith("get_snapshot_content", { id: 5 });
    expect(content).toBe("restored content");
  });

  it("restoreSnapshot returns null on error", async () => {
    mockedInvoke.mockRejectedValueOnce("not found");

    const content = await useSnapshotsStore.getState().restoreSnapshot(999);
    expect(content).toBeNull();
  });

  it("deleteSnapshot calls invoke and reloads", async () => {
    mockedInvoke
      .mockResolvedValueOnce(undefined) // delete_snapshot
      .mockResolvedValueOnce([]); // list_snapshots

    await useSnapshotsStore.getState().deleteSnapshot(3, "/ws/doc.md");

    expect(mockedInvoke).toHaveBeenCalledWith("delete_snapshot", { id: 3 });
    expect(mockedInvoke).toHaveBeenCalledWith("list_snapshots", {
      filePath: "/ws/doc.md",
    });
  });
});
