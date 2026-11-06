import { openFileDialog, openFolderDialog } from "@/lib/tauri";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedInvoke = vi.mocked(invoke);

describe("openFolderDialog / openFileDialog IPC", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("openFolderDialog invokes open_folder_dialog and returns selected path", async () => {
    mockedInvoke.mockResolvedValueOnce("/Users/test/writing");

    await expect(openFolderDialog()).resolves.toBe("/Users/test/writing");
    expect(mockedInvoke).toHaveBeenCalledWith("open_folder_dialog");
  });

  it("openFolderDialog returns null when the user cancels", async () => {
    mockedInvoke.mockResolvedValueOnce(null);

    await expect(openFolderDialog()).resolves.toBeNull();
  });

  it("openFileDialog invokes open_file_dialog and returns selected path", async () => {
    mockedInvoke.mockResolvedValueOnce("/Users/test/writing/notes.md");

    await expect(openFileDialog()).resolves.toBe("/Users/test/writing/notes.md");
    expect(mockedInvoke).toHaveBeenCalledWith("open_file_dialog");
  });

  it("openFileDialog returns null when the user cancels", async () => {
    mockedInvoke.mockResolvedValueOnce(null);

    await expect(openFileDialog()).resolves.toBeNull();
  });
});
