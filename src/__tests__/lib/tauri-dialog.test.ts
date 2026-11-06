import { readFileSync } from "node:fs";
import { join } from "node:path";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openFileDialog, openFolderDialog } from "@/lib/tauri";

const mockedInvoke = vi.mocked(invoke);

const filesRsPath = join(process.cwd(), "src-tauri/src/commands/files.rs");

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

describe("Rust dialog commands (regression guard)", () => {
  const source = readFileSync(filesRsPath, "utf8");

  it("does not ship silent Ok(None) stubs", () => {
    const folderFn = source.match(/pub async fn open_folder_dialog[\s\S]*?^}/m)?.[0];
    const fileFn = source.match(/pub async fn open_file_dialog[\s\S]*?^}/m)?.[0];
    expect(folderFn).toBeDefined();
    expect(fileFn).toBeDefined();
    expect(folderFn).toContain("blocking_pick_folder");
    expect(fileFn).toContain("blocking_pick_file");
    expect(folderFn).not.toMatch(/{\s*Ok\(None\)\s*}/);
    expect(fileFn).not.toMatch(/{\s*Ok\(None\)\s*}/);
  });

  it("returns null only after user cancellation", () => {
    expect(source).toContain("None => Ok(None)");
  });
});
