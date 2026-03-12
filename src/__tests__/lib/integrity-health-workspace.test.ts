import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type HealthThresholdSettings,
  DEFAULT_THRESHOLD_SETTINGS,
  loadWorkspaceThresholdSettings,
  removeWorkspaceThresholdSettings,
  resolveThresholdSettings,
  saveWorkspaceThresholdSettings,
} from "../../lib/integrity-health";

const WS_A = "/Users/alice/project-a";
const WS_B = "/Users/alice/project-b";
const PREFIX = "lazy-editor:integrity-health-thresholds:ws:";
const GLOBAL_KEY = "lazy-editor:integrity-health-thresholds";

const customSettings: HealthThresholdSettings = {
  goodMinScans7d: 5,
  goodMaxAgeDays: 3,
  poorMaxAgeDays: 10,
};

beforeEach(() => {
  localStorage.removeItem(GLOBAL_KEY);
  localStorage.removeItem(PREFIX + WS_A);
  localStorage.removeItem(PREFIX + WS_B);
});

afterEach(() => {
  localStorage.removeItem(GLOBAL_KEY);
  localStorage.removeItem(PREFIX + WS_A);
  localStorage.removeItem(PREFIX + WS_B);
});

// --- Per-workspace storage ---

describe("workspace threshold storage", () => {
  it("returns null when no workspace override exists", () => {
    expect(loadWorkspaceThresholdSettings(WS_A)).toBeNull();
  });

  it("roundtrips save + load for a workspace", () => {
    saveWorkspaceThresholdSettings(WS_A, customSettings);
    expect(loadWorkspaceThresholdSettings(WS_A)).toEqual(customSettings);
  });

  it("stores settings independently per workspace", () => {
    const settingsB: HealthThresholdSettings = { goodMinScans7d: 1, goodMaxAgeDays: 10, poorMaxAgeDays: 20 };
    saveWorkspaceThresholdSettings(WS_A, customSettings);
    saveWorkspaceThresholdSettings(WS_B, settingsB);

    expect(loadWorkspaceThresholdSettings(WS_A)).toEqual(customSettings);
    expect(loadWorkspaceThresholdSettings(WS_B)).toEqual(settingsB);
  });

  it("clamps invalid values on load", () => {
    localStorage.setItem(PREFIX + WS_A, JSON.stringify({ goodMinScans7d: 99, goodMaxAgeDays: -1, poorMaxAgeDays: 0 }));
    const loaded = loadWorkspaceThresholdSettings(WS_A);
    expect(loaded).not.toBeNull();
    expect(loaded!.goodMinScans7d).toBe(10);
    expect(loaded!.goodMaxAgeDays).toBe(1);
    expect(loaded!.poorMaxAgeDays).toBe(2);
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem(PREFIX + WS_A, "not-json");
    expect(loadWorkspaceThresholdSettings(WS_A)).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    localStorage.setItem(PREFIX + WS_A, "42");
    expect(loadWorkspaceThresholdSettings(WS_A)).toBeNull();
  });

  it("removes workspace override", () => {
    saveWorkspaceThresholdSettings(WS_A, customSettings);
    expect(loadWorkspaceThresholdSettings(WS_A)).not.toBeNull();

    removeWorkspaceThresholdSettings(WS_A);
    expect(loadWorkspaceThresholdSettings(WS_A)).toBeNull();
  });

  it("removing non-existent override does not throw", () => {
    expect(() => removeWorkspaceThresholdSettings(WS_A)).not.toThrow();
  });
});

// --- Resolution order ---

describe("resolveThresholdSettings", () => {
  it("returns global defaults when no workspace path", () => {
    const { settings, source } = resolveThresholdSettings(null);
    expect(source).toBe("global");
    expect(settings).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });

  it("returns global defaults when workspace has no override", () => {
    const { settings, source } = resolveThresholdSettings(WS_A);
    expect(source).toBe("global");
    expect(settings).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });

  it("returns workspace override when present", () => {
    saveWorkspaceThresholdSettings(WS_A, customSettings);
    const { settings, source } = resolveThresholdSettings(WS_A);
    expect(source).toBe("workspace");
    expect(settings).toEqual(customSettings);
  });

  it("returns global settings (non-default) when workspace has no override", () => {
    const globalCustom: HealthThresholdSettings = { goodMinScans7d: 3, goodMaxAgeDays: 5, poorMaxAgeDays: 12 };
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(globalCustom));
    const { settings, source } = resolveThresholdSettings(WS_A);
    expect(source).toBe("global");
    expect(settings).toEqual(globalCustom);
  });

  it("workspace override takes precedence over custom global", () => {
    const globalCustom: HealthThresholdSettings = { goodMinScans7d: 3, goodMaxAgeDays: 5, poorMaxAgeDays: 12 };
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(globalCustom));
    saveWorkspaceThresholdSettings(WS_A, customSettings);

    const { settings, source } = resolveThresholdSettings(WS_A);
    expect(source).toBe("workspace");
    expect(settings).toEqual(customSettings);
  });
});

// --- Switching workspaces ---

describe("workspace switching resolution", () => {
  it("resolves differently for different workspaces", () => {
    const settingsB: HealthThresholdSettings = { goodMinScans7d: 1, goodMaxAgeDays: 10, poorMaxAgeDays: 20 };
    saveWorkspaceThresholdSettings(WS_A, customSettings);
    saveWorkspaceThresholdSettings(WS_B, settingsB);

    const resA = resolveThresholdSettings(WS_A);
    const resB = resolveThresholdSettings(WS_B);

    expect(resA.settings).toEqual(customSettings);
    expect(resA.source).toBe("workspace");
    expect(resB.settings).toEqual(settingsB);
    expect(resB.source).toBe("workspace");
    expect(resA.settings).not.toEqual(resB.settings);
  });

  it("falls back to global when switching from workspace with override to one without", () => {
    saveWorkspaceThresholdSettings(WS_A, customSettings);

    const resA = resolveThresholdSettings(WS_A);
    expect(resA.source).toBe("workspace");

    const resB = resolveThresholdSettings(WS_B);
    expect(resB.source).toBe("global");
    expect(resB.settings).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });

  it("removing override makes workspace fall back to global on next resolve", () => {
    saveWorkspaceThresholdSettings(WS_A, customSettings);
    expect(resolveThresholdSettings(WS_A).source).toBe("workspace");

    removeWorkspaceThresholdSettings(WS_A);
    const { settings, source } = resolveThresholdSettings(WS_A);
    expect(source).toBe("global");
    expect(settings).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });
});
