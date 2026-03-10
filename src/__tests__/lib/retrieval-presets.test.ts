import {
  PRESET_IDS,
  RETRIEVAL_PRESETS,
  detectMatchingPreset,
  loadPresetFromStorage,
  savePresetToStorage,
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
});
