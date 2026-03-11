import {
  PRESET_IDS,
  RETRIEVAL_PRESETS,
  detectMatchingPreset,
  loadDocRetrievalSettings,
  loadPresetFromStorage,
  loadWorkspaceRetrievalSettings,
  resolveRetrievalSettings,
  saveDocRetrievalSettings,
  savePresetToStorage,
  saveWorkspaceRetrievalSettings,
} from "@/lib/retrieval-presets";
import { beforeEach, describe, expect, it } from "vitest";

const STORAGE_KEY = "lazy-editor:retrieval-preset";

describe("retrieval-presets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("preset definitions", () => {
    it("defines exactly 3 presets", () => {
      expect(PRESET_IDS).toHaveLength(3);
      expect(PRESET_IDS).toEqual(["writing", "research", "precision"]);
    });

    it("each preset has required fields", () => {
      for (const id of PRESET_IDS) {
        const preset = RETRIEVAL_PRESETS[id];
        expect(preset.id).toBe(id);
        expect(preset.label).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.topK).toBeGreaterThanOrEqual(1);
        expect(preset.topK).toBeLessThanOrEqual(10);
        expect(["all", "pinned"]).toContain(preset.scope);
      }
    });

    it("writing preset has balanced defaults", () => {
      expect(RETRIEVAL_PRESETS.writing).toMatchObject({ topK: 5, scope: "all" });
    });

    it("research preset maximises context", () => {
      expect(RETRIEVAL_PRESETS.research).toMatchObject({ topK: 8, scope: "all" });
    });

    it("precision preset is focused", () => {
      expect(RETRIEVAL_PRESETS.precision).toMatchObject({ topK: 3, scope: "pinned" });
    });

    it("no two presets share the same topK+scope pair", () => {
      const keys = PRESET_IDS.map((id) => `${RETRIEVAL_PRESETS[id].topK}:${RETRIEVAL_PRESETS[id].scope}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("persistence", () => {
    it("loadPresetFromStorage returns null when empty", () => {
      expect(loadPresetFromStorage()).toBeNull();
    });

    it("savePresetToStorage + loadPresetFromStorage round-trips", () => {
      savePresetToStorage("research");
      expect(loadPresetFromStorage()).toBe("research");
    });

    it("savePresetToStorage(null) clears storage", () => {
      savePresetToStorage("writing");
      savePresetToStorage(null);
      expect(loadPresetFromStorage()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("loadPresetFromStorage ignores invalid values", () => {
      localStorage.setItem(STORAGE_KEY, "nonexistent");
      expect(loadPresetFromStorage()).toBeNull();
    });
  });

  describe("detectMatchingPreset", () => {
    it("matches writing preset", () => {
      expect(detectMatchingPreset(5, "all")).toBe("writing");
    });

    it("matches research preset", () => {
      expect(detectMatchingPreset(8, "all")).toBe("research");
    });

    it("matches precision preset", () => {
      expect(detectMatchingPreset(3, "pinned")).toBe("precision");
    });

    it("returns null for non-matching settings", () => {
      expect(detectMatchingPreset(7, "all")).toBeNull();
      expect(detectMatchingPreset(5, "pinned")).toBeNull();
      expect(detectMatchingPreset(1, "all")).toBeNull();
    });
  });

  describe("per-document persistence", () => {
    it("loadDocRetrievalSettings returns null when empty", () => {
      expect(loadDocRetrievalSettings("/path/to/file.md")).toBeNull();
    });

    it("saveDocRetrievalSettings + loadDocRetrievalSettings round-trips", () => {
      saveDocRetrievalSettings("/path/essay.md", { preset: "research", topK: 8, scope: "all" });
      const loaded = loadDocRetrievalSettings("/path/essay.md");
      expect(loaded).toEqual({ preset: "research", topK: 8, scope: "all" });
    });

    it("stores different settings for different documents", () => {
      saveDocRetrievalSettings("/a.md", { preset: "writing", topK: 5, scope: "all" });
      saveDocRetrievalSettings("/b.md", { preset: "precision", topK: 3, scope: "pinned" });
      expect(loadDocRetrievalSettings("/a.md")?.preset).toBe("writing");
      expect(loadDocRetrievalSettings("/b.md")?.preset).toBe("precision");
    });

    it("stores custom (null preset) settings", () => {
      saveDocRetrievalSettings("/c.md", { preset: null, topK: 7, scope: "all" });
      const loaded = loadDocRetrievalSettings("/c.md");
      expect(loaded).toEqual({ preset: null, topK: 7, scope: "all" });
    });

    it("clamps topK on load", () => {
      localStorage.setItem(
        "lazy-editor:doc-retrieval:/bad.md",
        JSON.stringify({ preset: null, topK: 99, scope: "all" }),
      );
      expect(loadDocRetrievalSettings("/bad.md")?.topK).toBe(10);
    });

    it("returns null for invalid scope on load", () => {
      localStorage.setItem(
        "lazy-editor:doc-retrieval:/bad2.md",
        JSON.stringify({ preset: null, topK: 5, scope: "invalid" }),
      );
      expect(loadDocRetrievalSettings("/bad2.md")).toBeNull();
    });

    it("returns null for invalid preset on load (falls to null)", () => {
      localStorage.setItem(
        "lazy-editor:doc-retrieval:/bad3.md",
        JSON.stringify({ preset: "nonexistent", topK: 5, scope: "all" }),
      );
      const loaded = loadDocRetrievalSettings("/bad3.md");
      expect(loaded?.preset).toBeNull();
    });
  });

  describe("per-workspace persistence", () => {
    it("loadWorkspaceRetrievalSettings returns null when empty", () => {
      expect(loadWorkspaceRetrievalSettings("/workspace")).toBeNull();
    });

    it("saveWorkspaceRetrievalSettings + loadWorkspaceRetrievalSettings round-trips", () => {
      saveWorkspaceRetrievalSettings("/workspace", { preset: "research", topK: 8, scope: "all" });
      const loaded = loadWorkspaceRetrievalSettings("/workspace");
      expect(loaded).toEqual({ preset: "research", topK: 8, scope: "all" });
    });

    it("stores different settings for different workspaces", () => {
      saveWorkspaceRetrievalSettings("/ws-a", { preset: "writing", topK: 5, scope: "all" });
      saveWorkspaceRetrievalSettings("/ws-b", { preset: "precision", topK: 3, scope: "pinned" });
      expect(loadWorkspaceRetrievalSettings("/ws-a")?.preset).toBe("writing");
      expect(loadWorkspaceRetrievalSettings("/ws-b")?.preset).toBe("precision");
    });

    it("stores custom (null preset) settings", () => {
      saveWorkspaceRetrievalSettings("/ws", { preset: null, topK: 6, scope: "pinned" });
      const loaded = loadWorkspaceRetrievalSettings("/ws");
      expect(loaded).toEqual({ preset: null, topK: 6, scope: "pinned" });
    });

    it("clamps topK on load", () => {
      localStorage.setItem(
        "lazy-editor:workspace-retrieval:/bad-ws",
        JSON.stringify({ preset: null, topK: 99, scope: "all" }),
      );
      expect(loadWorkspaceRetrievalSettings("/bad-ws")?.topK).toBe(10);
    });

    it("returns null for invalid scope on load", () => {
      localStorage.setItem(
        "lazy-editor:workspace-retrieval:/bad-ws2",
        JSON.stringify({ preset: null, topK: 5, scope: "invalid" }),
      );
      expect(loadWorkspaceRetrievalSettings("/bad-ws2")).toBeNull();
    });

    it("returns null for invalid preset on load (falls to null)", () => {
      localStorage.setItem(
        "lazy-editor:workspace-retrieval:/bad-ws3",
        JSON.stringify({ preset: "nonexistent", topK: 5, scope: "all" }),
      );
      const loaded = loadWorkspaceRetrievalSettings("/bad-ws3");
      expect(loaded?.preset).toBeNull();
    });
  });

  describe("resolveRetrievalSettings — precedence chain", () => {
    it("returns global defaults when nothing is stored", () => {
      const { settings, source } = resolveRetrievalSettings(null, null);
      expect(source).toBe("global");
      expect(settings.preset).toBeNull();
      expect(settings.topK).toBe(5);
      expect(settings.scope).toBe("all");
    });

    it("returns global preset when only global is set", () => {
      savePresetToStorage("research");
      const { settings, source } = resolveRetrievalSettings("/file.md", "/workspace");
      expect(source).toBe("global");
      expect(settings.preset).toBe("research");
      expect(settings.topK).toBe(8);
    });

    it("workspace overrides global", () => {
      savePresetToStorage("research");
      saveWorkspaceRetrievalSettings("/workspace", { preset: "precision", topK: 3, scope: "pinned" });
      const { settings, source } = resolveRetrievalSettings("/file.md", "/workspace");
      expect(source).toBe("workspace");
      expect(settings.preset).toBe("precision");
      expect(settings.topK).toBe(3);
      expect(settings.scope).toBe("pinned");
    });

    it("per-doc overrides workspace", () => {
      savePresetToStorage("research");
      saveWorkspaceRetrievalSettings("/workspace", { preset: "precision", topK: 3, scope: "pinned" });
      saveDocRetrievalSettings("/file.md", { preset: "writing", topK: 5, scope: "all" });
      const { settings, source } = resolveRetrievalSettings("/file.md", "/workspace");
      expect(source).toBe("doc");
      expect(settings.preset).toBe("writing");
      expect(settings.topK).toBe(5);
      expect(settings.scope).toBe("all");
    });

    it("per-doc overrides global (no workspace)", () => {
      savePresetToStorage("research");
      saveDocRetrievalSettings("/file.md", { preset: "writing", topK: 5, scope: "all" });
      const { settings, source } = resolveRetrievalSettings("/file.md", null);
      expect(source).toBe("doc");
      expect(settings.preset).toBe("writing");
    });

    it("workspace is used when file has no per-doc settings", () => {
      saveWorkspaceRetrievalSettings("/workspace", { preset: "precision", topK: 3, scope: "pinned" });
      const { settings, source } = resolveRetrievalSettings("/new-file.md", "/workspace");
      expect(source).toBe("workspace");
      expect(settings.preset).toBe("precision");
    });

    it("skips workspace when workspacePath is null", () => {
      saveWorkspaceRetrievalSettings("/workspace", { preset: "precision", topK: 3, scope: "pinned" });
      savePresetToStorage("research");
      const { settings, source } = resolveRetrievalSettings("/file.md", null);
      expect(source).toBe("global");
      expect(settings.preset).toBe("research");
    });

    it("skips doc when filePath is null, uses workspace", () => {
      saveWorkspaceRetrievalSettings("/workspace", { preset: "writing", topK: 5, scope: "all" });
      const { settings, source } = resolveRetrievalSettings(null, "/workspace");
      expect(source).toBe("workspace");
      expect(settings.preset).toBe("writing");
    });
  });
});
