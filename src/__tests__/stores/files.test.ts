import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useFilesStore } from "@/stores/files";

const mockedInvoke = vi.mocked(invoke);

function resetStore() {
  useFilesStore.setState({
    workspacePath: null,
    files: [],
    activeFilePath: null,
    activeFileContent: "",
    isDirty: false,
  });
}

describe("useFilesStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useFilesStore.getState();
    expect(state.workspacePath).toBeNull();
    expect(state.files).toEqual([]);
    expect(state.activeFilePath).toBeNull();
    expect(state.activeFileContent).toBe("");
    expect(state.isDirty).toBe(false);
  });

  it("setActiveFile sets path, content, and clears dirty", () => {
    useFilesStore.getState().setDirty(true);
    useFilesStore.getState().setActiveFile("/path/file.md", "# Hello");
    const state = useFilesStore.getState();
    expect(state.activeFilePath).toBe("/path/file.md");
    expect(state.activeFileContent).toBe("# Hello");
    expect(state.isDirty).toBe(false);
  });

  it("setDirty marks file as dirty", () => {
    useFilesStore.getState().setDirty(true);
    expect(useFilesStore.getState().isDirty).toBe(true);
  });

  it("loadWorkspace calls invoke and sets workspace state", async () => {
    mockedInvoke.mockResolvedValueOnce({
      path: "/workspace",
      files: [{ name: "test.md", path: "/workspace/test.md", isDir: false, modified: 1000 }],
    });

    await useFilesStore.getState().loadWorkspace();

    expect(mockedInvoke).toHaveBeenCalledWith("get_workspace");
    const state = useFilesStore.getState();
    expect(state.workspacePath).toBe("/workspace");
    expect(state.files).toHaveLength(1);
    expect(state.files[0].name).toBe("test.md");
  });

  it("loadWorkspace handles error gracefully", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("no workspace"));
    await useFilesStore.getState().loadWorkspace();
    // Should not throw, workspace stays null
    expect(useFilesStore.getState().workspacePath).toBeNull();
  });

  it("openFile calls invoke and sets active file", async () => {
    mockedInvoke.mockResolvedValueOnce("# Content");

    await useFilesStore.getState().openFile("/workspace/doc.md");

    expect(mockedInvoke).toHaveBeenCalledWith("open_file", { path: "/workspace/doc.md" });
    expect(useFilesStore.getState().activeFilePath).toBe("/workspace/doc.md");
    expect(useFilesStore.getState().activeFileContent).toBe("# Content");
    expect(useFilesStore.getState().isDirty).toBe(false);
  });

  it("saveFile calls invoke with active file data", async () => {
    useFilesStore.setState({
      activeFilePath: "/workspace/doc.md",
      activeFileContent: "updated content",
      isDirty: true,
    });
    mockedInvoke.mockResolvedValueOnce(undefined);

    await useFilesStore.getState().saveFile();

    expect(mockedInvoke).toHaveBeenCalledWith("save_file", {
      path: "/workspace/doc.md",
      content: "updated content",
    });
    expect(useFilesStore.getState().isDirty).toBe(false);
  });

  it("saveFile does nothing when no active file", async () => {
    await useFilesStore.getState().saveFile();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("createFile saves, reloads workspace, and opens the new file", async () => {
    useFilesStore.setState({ workspacePath: "/workspace" });
    // save_file, get_workspace, open_file
    mockedInvoke
      .mockResolvedValueOnce(undefined)  // save_file
      .mockResolvedValueOnce({ path: "/workspace", files: [] })  // get_workspace
      .mockResolvedValueOnce("# notes\n\n");  // open_file

    await useFilesStore.getState().createFile("notes.md");

    expect(mockedInvoke).toHaveBeenCalledWith("save_file", {
      path: "/workspace/notes.md",
      content: "# notes\n\n",
    });
  });
});
