import {
  checkRecovery,
  cleanupDrafts,
  clearDraft,
  getAllDraftKeys,
  getDraft,
  persistDraft,
} from "@/lib/recovery";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function clearAllDrafts() {
  for (const key of getAllDraftKeys()) {
    localStorage.removeItem(key);
  }
}

describe("recovery draft utilities", () => {
  beforeEach(() => {
    clearAllDrafts();
  });

  afterEach(() => {
    clearAllDrafts();
  });

  it("persistDraft stores and getDraft retrieves a draft", () => {
    persistDraft("/ws/doc.md", "<p>hello</p>");
    const draft = getDraft("/ws/doc.md");
    expect(draft).not.toBeNull();
    expect(draft!.filePath).toBe("/ws/doc.md");
    expect(draft!.content).toBe("<p>hello</p>");
    expect(draft!.timestamp).toBeGreaterThan(0);
  });

  it("getDraft returns null when no draft exists", () => {
    expect(getDraft("/ws/nonexistent.md")).toBeNull();
  });

  it("clearDraft removes the draft", () => {
    persistDraft("/ws/doc.md", "content");
    expect(getDraft("/ws/doc.md")).not.toBeNull();
    clearDraft("/ws/doc.md");
    expect(getDraft("/ws/doc.md")).toBeNull();
  });

  it("handles null filePath (untitled)", () => {
    persistDraft(null, "untitled content");
    const draft = getDraft(null);
    expect(draft).not.toBeNull();
    expect(draft!.filePath).toBe("__untitled__");
    expect(draft!.content).toBe("untitled content");
    clearDraft(null);
    expect(getDraft(null)).toBeNull();
  });

  it("getAllDraftKeys returns all recovery keys", () => {
    persistDraft("/ws/a.md", "a");
    persistDraft("/ws/b.md", "b");
    const keys = getAllDraftKeys();
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.startsWith("lazy-editor:recovery:"))).toBe(true);
  });

  it("checkRecovery returns draft when content differs", () => {
    persistDraft("/ws/doc.md", "<p>unsaved version</p>");
    const draft = checkRecovery("/ws/doc.md", "<p>saved version</p>");
    expect(draft).not.toBeNull();
    expect(draft!.content).toBe("<p>unsaved version</p>");
  });

  it("checkRecovery returns null and clears draft when content matches", () => {
    persistDraft("/ws/doc.md", "<p>same</p>");
    const draft = checkRecovery("/ws/doc.md", "<p>same</p>");
    expect(draft).toBeNull();
    // Draft should be cleaned up
    expect(getDraft("/ws/doc.md")).toBeNull();
  });

  it("checkRecovery returns null when no draft exists", () => {
    expect(checkRecovery("/ws/doc.md", "content")).toBeNull();
  });

  it("cleanupDrafts removes drafts older than 7 days", () => {
    // Manually insert an old draft
    const oldDraft = {
      filePath: "/ws/old.md",
      content: "old",
      timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    };
    localStorage.setItem(
      "lazy-editor:recovery:/ws/old.md",
      JSON.stringify(oldDraft),
    );
    persistDraft("/ws/recent.md", "recent");

    cleanupDrafts();

    expect(getDraft("/ws/old.md")).toBeNull();
    expect(getDraft("/ws/recent.md")).not.toBeNull();
  });

  it("cleanupDrafts caps total drafts to 20, removing oldest", () => {
    // Create 25 drafts
    for (let i = 0; i < 25; i++) {
      const draft = {
        filePath: `/ws/file${i}.md`,
        content: `content ${i}`,
        timestamp: Date.now() - (25 - i) * 1000, // stagger timestamps
      };
      localStorage.setItem(
        `lazy-editor:recovery:/ws/file${i}.md`,
        JSON.stringify(draft),
      );
    }

    expect(getAllDraftKeys()).toHaveLength(25);
    cleanupDrafts();
    expect(getAllDraftKeys()).toHaveLength(20);

    // Oldest 5 should be removed (file0–file4)
    for (let i = 0; i < 5; i++) {
      expect(getDraft(`/ws/file${i}.md`)).toBeNull();
    }
    // Newest 20 should remain (file5–file24)
    for (let i = 5; i < 25; i++) {
      expect(getDraft(`/ws/file${i}.md`)).not.toBeNull();
    }
  });

  it("persistDraft overwrites existing draft for same file", () => {
    persistDraft("/ws/doc.md", "v1");
    persistDraft("/ws/doc.md", "v2");
    const draft = getDraft("/ws/doc.md");
    expect(draft!.content).toBe("v2");
    expect(getAllDraftKeys()).toHaveLength(1);
  });
});
