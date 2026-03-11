import { afterEach, describe, expect, it } from "vitest";
import {
  type ReferenceProfile,
  BUILTIN_PROFILES,
  deleteCustomProfile,
  getProfileById,
  listProfiles,
  loadActiveProfileId,
  loadCitationSettings,
  loadCustomProfiles,
  loadFieldOptions,
  loadLastTemplate,
  saveActiveProfileId,
  saveCitationSettings,
  saveCustomProfile,
  saveFieldOptions,
  saveLastTemplate,
} from "@/lib/citation-notes";

// ---------------------------------------------------------------------------
// Built-in profiles
// ---------------------------------------------------------------------------

describe("BUILTIN_PROFILES", () => {
  it("has exactly three built-in profiles", () => {
    expect(BUILTIN_PROFILES).toHaveLength(3);
  });

  it("includes Compact Default with expected settings", () => {
    const p = BUILTIN_PROFILES.find((b) => b.id === "builtin:compact-default");
    expect(p).toBeDefined();
    expect(p!.name).toBe("Compact Default");
    expect(p!.templateId).toBe("compact");
    expect(p!.fields.showRelevance).toBe(true);
    expect(p!.fields.showChunkLabel).toBe(true);
    expect(p!.isBuiltin).toBe(true);
  });

  it("includes Academic Full with expected settings", () => {
    const p = BUILTIN_PROFILES.find((b) => b.id === "builtin:academic-full");
    expect(p).toBeDefined();
    expect(p!.name).toBe("Academic Full");
    expect(p!.templateId).toBe("academic");
    expect(p!.fields.showRelevance).toBe(true);
    expect(p!.fields.showChunkLabel).toBe(true);
    expect(p!.isBuiltin).toBe(true);
  });

  it("includes Academic Minimal with expected settings", () => {
    const p = BUILTIN_PROFILES.find((b) => b.id === "builtin:academic-minimal");
    expect(p).toBeDefined();
    expect(p!.name).toBe("Academic Minimal");
    expect(p!.templateId).toBe("academic");
    expect(p!.fields.showRelevance).toBe(false);
    expect(p!.fields.showChunkLabel).toBe(false);
    expect(p!.isBuiltin).toBe(true);
  });

  it("all built-in profiles have isBuiltin=true", () => {
    for (const p of BUILTIN_PROFILES) {
      expect(p.isBuiltin).toBe(true);
    }
  });

  it("all built-in profile IDs start with 'builtin:'", () => {
    for (const p of BUILTIN_PROFILES) {
      expect(p.id.startsWith("builtin:")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Custom profile CRUD
// ---------------------------------------------------------------------------

describe("custom profile CRUD", () => {
  afterEach(() => localStorage.clear());

  it("loadCustomProfiles returns empty array when nothing stored", () => {
    expect(loadCustomProfiles()).toEqual([]);
  });

  it("saveCustomProfile creates a new profile with a unique ID", () => {
    const p = saveCustomProfile("My Style", "compact", {
      showRelevance: false,
      showChunkLabel: true,
    });
    expect(p.id).toMatch(/^custom:/);
    expect(p.name).toBe("My Style");
    expect(p.templateId).toBe("compact");
    expect(p.fields.showRelevance).toBe(false);
    expect(p.fields.showChunkLabel).toBe(true);
    expect(p.isBuiltin).toBe(false);
  });

  it("saveCustomProfile persists to localStorage", () => {
    saveCustomProfile("Test", "academic", {
      showRelevance: true,
      showChunkLabel: false,
    });
    const loaded = loadCustomProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Test");
    expect(loaded[0].templateId).toBe("academic");
    expect(loaded[0].fields.showRelevance).toBe(true);
    expect(loaded[0].fields.showChunkLabel).toBe(false);
    expect(loaded[0].isBuiltin).toBe(false);
  });

  it("can save multiple custom profiles", () => {
    saveCustomProfile("A", "compact", { showRelevance: true, showChunkLabel: true });
    saveCustomProfile("B", "academic", { showRelevance: false, showChunkLabel: false });
    const loaded = loadCustomProfiles();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].name).toBe("A");
    expect(loaded[1].name).toBe("B");
  });

  it("deleteCustomProfile removes a custom profile", () => {
    const p = saveCustomProfile("ToDelete", "compact", {
      showRelevance: true,
      showChunkLabel: true,
    });
    expect(deleteCustomProfile(p.id)).toBe(true);
    expect(loadCustomProfiles()).toHaveLength(0);
  });

  it("deleteCustomProfile returns false for nonexistent ID", () => {
    expect(deleteCustomProfile("custom:nonexistent")).toBe(false);
  });

  it("deleteCustomProfile refuses to delete built-in profiles", () => {
    const builtinId = BUILTIN_PROFILES[0].id;
    expect(deleteCustomProfile(builtinId)).toBe(false);
  });

  it("deleteCustomProfile only removes the target profile", () => {
    const a = saveCustomProfile("A", "compact", { showRelevance: true, showChunkLabel: true });
    saveCustomProfile("B", "academic", { showRelevance: false, showChunkLabel: false });
    expect(deleteCustomProfile(a.id)).toBe(true);
    const remaining = loadCustomProfiles();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("B");
  });

  it("loadCustomProfiles returns empty for corrupted JSON", () => {
    localStorage.setItem("lazy-editor:reference-profiles", "not json");
    expect(loadCustomProfiles()).toEqual([]);
  });

  it("loadCustomProfiles returns empty for non-array JSON", () => {
    localStorage.setItem("lazy-editor:reference-profiles", JSON.stringify({ foo: "bar" }));
    expect(loadCustomProfiles()).toEqual([]);
  });

  it("loadCustomProfiles filters out invalid entries", () => {
    const valid: ReferenceProfile = {
      id: "custom:valid",
      name: "Valid",
      templateId: "compact",
      fields: { showRelevance: true, showChunkLabel: false },
      isBuiltin: false,
    };
    const invalid = { id: 123, name: null };
    localStorage.setItem(
      "lazy-editor:reference-profiles",
      JSON.stringify([valid, invalid]),
    );
    const loaded = loadCustomProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Valid");
  });

  it("loadCustomProfiles forces isBuiltin=false on loaded profiles", () => {
    const tampered = {
      id: "custom:tampered",
      name: "Tampered",
      templateId: "compact",
      fields: { showRelevance: true, showChunkLabel: true },
      isBuiltin: true, // tampered
    };
    localStorage.setItem(
      "lazy-editor:reference-profiles",
      JSON.stringify([tampered]),
    );
    const loaded = loadCustomProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].isBuiltin).toBe(false);
  });

  it("loadCustomProfiles rejects entries with invalid templateId", () => {
    const bad = {
      id: "custom:bad",
      name: "Bad",
      templateId: "nonexistent",
      fields: { showRelevance: true, showChunkLabel: true },
      isBuiltin: false,
    };
    localStorage.setItem(
      "lazy-editor:reference-profiles",
      JSON.stringify([bad]),
    );
    expect(loadCustomProfiles()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listProfiles / getProfileById
// ---------------------------------------------------------------------------

describe("listProfiles", () => {
  afterEach(() => localStorage.clear());

  it("returns built-in profiles when no custom profiles exist", () => {
    const all = listProfiles();
    expect(all).toHaveLength(BUILTIN_PROFILES.length);
    expect(all.every((p) => p.isBuiltin)).toBe(true);
  });

  it("returns built-in + custom profiles", () => {
    saveCustomProfile("Custom", "compact", { showRelevance: true, showChunkLabel: true });
    const all = listProfiles();
    expect(all).toHaveLength(BUILTIN_PROFILES.length + 1);
    // Built-ins come first
    for (let i = 0; i < BUILTIN_PROFILES.length; i++) {
      expect(all[i].id).toBe(BUILTIN_PROFILES[i].id);
    }
    // Custom is last
    expect(all[all.length - 1].name).toBe("Custom");
  });
});

describe("getProfileById", () => {
  afterEach(() => localStorage.clear());

  it("finds built-in profiles by ID", () => {
    const p = getProfileById("builtin:compact-default");
    expect(p).toBeDefined();
    expect(p!.name).toBe("Compact Default");
  });

  it("finds custom profiles by ID", () => {
    const saved = saveCustomProfile("Mine", "academic", {
      showRelevance: false,
      showChunkLabel: true,
    });
    const found = getProfileById(saved.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Mine");
    expect(found!.templateId).toBe("academic");
  });

  it("returns undefined for nonexistent ID", () => {
    expect(getProfileById("nonexistent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Active profile persistence
// ---------------------------------------------------------------------------

describe("active profile persistence", () => {
  afterEach(() => localStorage.clear());

  it("loadActiveProfileId returns null when nothing stored", () => {
    expect(loadActiveProfileId()).toBeNull();
  });

  it("round-trips a saved active profile ID", () => {
    saveActiveProfileId("builtin:compact-default");
    expect(loadActiveProfileId()).toBe("builtin:compact-default");
  });

  it("saveActiveProfileId(null) clears the stored value", () => {
    saveActiveProfileId("builtin:compact-default");
    saveActiveProfileId(null);
    expect(loadActiveProfileId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadCitationSettings — profile-aware with backward compatibility
// ---------------------------------------------------------------------------

describe("loadCitationSettings", () => {
  afterEach(() => localStorage.clear());

  it("falls back to legacy settings when no active profile is set", () => {
    saveLastTemplate("academic");
    saveFieldOptions({ showRelevance: false, showChunkLabel: true });
    const settings = loadCitationSettings();
    expect(settings.templateId).toBe("academic");
    expect(settings.fields.showRelevance).toBe(false);
    expect(settings.fields.showChunkLabel).toBe(true);
    expect(settings.activeProfileId).toBeNull();
  });

  it("uses defaults when nothing is stored (backward compat)", () => {
    const settings = loadCitationSettings();
    expect(settings.templateId).toBe("compact");
    expect(settings.fields.showRelevance).toBe(true);
    expect(settings.fields.showChunkLabel).toBe(true);
    expect(settings.activeProfileId).toBeNull();
  });

  it("loads settings from active built-in profile", () => {
    saveActiveProfileId("builtin:academic-minimal");
    const settings = loadCitationSettings();
    expect(settings.templateId).toBe("academic");
    expect(settings.fields.showRelevance).toBe(false);
    expect(settings.fields.showChunkLabel).toBe(false);
    expect(settings.activeProfileId).toBe("builtin:academic-minimal");
  });

  it("loads settings from active custom profile", () => {
    const p = saveCustomProfile("My Prof", "academic", {
      showRelevance: true,
      showChunkLabel: false,
    });
    saveActiveProfileId(p.id);
    const settings = loadCitationSettings();
    expect(settings.templateId).toBe("academic");
    expect(settings.fields.showRelevance).toBe(true);
    expect(settings.fields.showChunkLabel).toBe(false);
    expect(settings.activeProfileId).toBe(p.id);
  });

  it("falls back to legacy if stored profile ID is stale", () => {
    saveActiveProfileId("custom:deleted-long-ago");
    saveLastTemplate("academic");
    saveFieldOptions({ showRelevance: false, showChunkLabel: false });
    const settings = loadCitationSettings();
    // Profile not found, falls back
    expect(settings.templateId).toBe("academic");
    expect(settings.fields.showRelevance).toBe(false);
    expect(settings.fields.showChunkLabel).toBe(false);
    expect(settings.activeProfileId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveCitationSettings
// ---------------------------------------------------------------------------

describe("saveCitationSettings", () => {
  afterEach(() => localStorage.clear());

  it("mirrors template and fields to legacy keys", () => {
    saveCitationSettings("academic", { showRelevance: false, showChunkLabel: true }, "builtin:academic-full");
    expect(loadLastTemplate()).toBe("academic");
    const fields = loadFieldOptions();
    expect(fields.showRelevance).toBe(false);
    expect(fields.showChunkLabel).toBe(true);
    expect(loadActiveProfileId()).toBe("builtin:academic-full");
  });

  it("clears active profile when profileId is null", () => {
    saveActiveProfileId("builtin:compact-default");
    saveCitationSettings("compact", { showRelevance: true, showChunkLabel: true }, null);
    expect(loadActiveProfileId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility — existing stored settings still work
// ---------------------------------------------------------------------------

describe("backward compatibility", () => {
  afterEach(() => localStorage.clear());

  it("existing template + fields load correctly without profile keys", () => {
    // Simulate pre-profile storage
    localStorage.setItem("lazy-editor:citation-template", "academic");
    localStorage.setItem(
      "lazy-editor:citation-fields",
      JSON.stringify({ showRelevance: false, showChunkLabel: true }),
    );
    // No profile keys exist
    const settings = loadCitationSettings();
    expect(settings.templateId).toBe("academic");
    expect(settings.fields.showRelevance).toBe(false);
    expect(settings.fields.showChunkLabel).toBe(true);
    expect(settings.activeProfileId).toBeNull();
  });

  it("legacy loadLastTemplate still works independently", () => {
    localStorage.setItem("lazy-editor:citation-template", "compact");
    expect(loadLastTemplate()).toBe("compact");
  });

  it("legacy loadFieldOptions still works independently", () => {
    localStorage.setItem(
      "lazy-editor:citation-fields",
      JSON.stringify({ showRelevance: true, showChunkLabel: false }),
    );
    const opts = loadFieldOptions();
    expect(opts.showRelevance).toBe(true);
    expect(opts.showChunkLabel).toBe(false);
  });

  it("saveCitationSettings writes to all legacy keys for compatibility", () => {
    saveCitationSettings("academic", { showRelevance: false, showChunkLabel: true }, "builtin:academic-full");
    // Check legacy keys directly
    expect(localStorage.getItem("lazy-editor:citation-template")).toBe("academic");
    const fields = JSON.parse(localStorage.getItem("lazy-editor:citation-fields")!);
    expect(fields.showRelevance).toBe(false);
    expect(fields.showChunkLabel).toBe(true);
    // And the new profile key
    expect(localStorage.getItem("lazy-editor:active-profile")).toBe("builtin:academic-full");
  });

  it("empty custom profiles storage does not affect built-in listing", () => {
    localStorage.setItem("lazy-editor:reference-profiles", "[]");
    const all = listProfiles();
    expect(all).toHaveLength(BUILTIN_PROFILES.length);
  });
});
