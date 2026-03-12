import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type HealthThresholdSettings,
  DEFAULT_THRESHOLD_SETTINGS,
} from "../../lib/integrity-health";
import {
  type ThresholdConfigPayload,
  CONFIG_KIND,
  CURRENT_SCHEMA_VERSION,
  applyThresholdConfig,
  buildThresholdExportPayload,
  formatValidationErrors,
  parseThresholdConfig,
  serializeThresholdConfig,
  validateThresholdConfig,
} from "../../lib/integrity-threshold-io";

const GLOBAL_KEY = "lazy-editor:integrity-health-thresholds";
const WS_PREFIX = "lazy-editor:integrity-health-thresholds:ws:";
const WS_A = "/Users/alice/project-a";
const WS_B = "/Users/bob/project-b";

function makeValidPayload(overrides?: Partial<ThresholdConfigPayload>): ThresholdConfigPayload {
  return {
    version: CURRENT_SCHEMA_VERSION,
    kind: CONFIG_KIND,
    exportedAt: "2026-03-12T00:00:00.000Z",
    defaults: { ...DEFAULT_THRESHOLD_SETTINGS },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// --- Schema validation ---

describe("validateThresholdConfig", () => {
  it("accepts a valid minimal payload", () => {
    const result = validateThresholdConfig(makeValidPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.version).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.payload.kind).toBe(CONFIG_KIND);
      expect(result.payload.defaults).toEqual(DEFAULT_THRESHOLD_SETTINGS);
    }
  });

  it("accepts payload with workspace overrides", () => {
    const wsSettings: HealthThresholdSettings = { goodMinScans7d: 5, goodMaxAgeDays: 3, poorMaxAgeDays: 10 };
    const result = validateThresholdConfig(makeValidPayload({ workspaces: { [WS_A]: wsSettings } }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.workspaces?.[WS_A]).toEqual(wsSettings);
    }
  });

  it("rejects non-object input", () => {
    expect(validateThresholdConfig("string").ok).toBe(false);
    expect(validateThresholdConfig(42).ok).toBe(false);
    expect(validateThresholdConfig(null).ok).toBe(false);
    expect(validateThresholdConfig([]).ok).toBe(false);
  });

  it("rejects missing version", () => {
    const { version, ...rest } = makeValidPayload();
    const result = validateThresholdConfig(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("$.version");
  });

  it("rejects wrong version", () => {
    const result = validateThresholdConfig(makeValidPayload({ version: 99 } as any));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("unsupported version");
  });

  it("rejects missing kind", () => {
    const { kind, ...rest } = makeValidPayload();
    const result = validateThresholdConfig(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("$.kind");
  });

  it("rejects wrong kind", () => {
    const result = validateThresholdConfig(makeValidPayload({ kind: "wrong" } as any));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("unexpected kind");
  });

  it("rejects missing defaults", () => {
    const { defaults, ...rest } = makeValidPayload();
    const result = validateThresholdConfig(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("$.defaults");
  });

  it("rejects non-object defaults", () => {
    const result = validateThresholdConfig(makeValidPayload({ defaults: 42 as any }));
    expect(result.ok).toBe(false);
  });

  it("rejects missing required fields in defaults", () => {
    const result = validateThresholdConfig(
      makeValidPayload({ defaults: { goodMinScans7d: 2 } as any }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain("$.defaults.goodMaxAgeDays");
      expect(paths).toContain("$.defaults.poorMaxAgeDays");
    }
  });

  it("rejects non-number threshold values", () => {
    const result = validateThresholdConfig(
      makeValidPayload({
        defaults: { goodMinScans7d: "two", goodMaxAgeDays: 7, poorMaxAgeDays: 14 } as any,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("$.defaults.goodMinScans7d");
  });

  it("rejects NaN/Infinity threshold values", () => {
    const r1 = validateThresholdConfig(
      makeValidPayload({ defaults: { goodMinScans7d: NaN, goodMaxAgeDays: 7, poorMaxAgeDays: 14 } }),
    );
    expect(r1.ok).toBe(false);

    const r2 = validateThresholdConfig(
      makeValidPayload({ defaults: { goodMinScans7d: 2, goodMaxAgeDays: Infinity, poorMaxAgeDays: 14 } }),
    );
    expect(r2.ok).toBe(false);
  });

  it("clamps out-of-range values silently", () => {
    const result = validateThresholdConfig(
      makeValidPayload({ defaults: { goodMinScans7d: 99, goodMaxAgeDays: -5, poorMaxAgeDays: 200 } }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.defaults.goodMinScans7d).toBe(10);
      expect(result.payload.defaults.goodMaxAgeDays).toBe(1);
      expect(result.payload.defaults.poorMaxAgeDays).toBe(60);
    }
  });

  it("rejects non-object workspaces", () => {
    const result = validateThresholdConfig(makeValidPayload({ workspaces: "bad" as any }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("$.workspaces");
  });

  it("validates each workspace block independently", () => {
    const result = validateThresholdConfig(
      makeValidPayload({
        workspaces: {
          [WS_A]: { goodMinScans7d: 3, goodMaxAgeDays: 5, poorMaxAgeDays: 12 },
          [WS_B]: { goodMinScans7d: "bad" } as any,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes(WS_B))).toBe(true);
    }
  });

  it("accepts payload without workspaces key", () => {
    const payload = makeValidPayload();
    delete (payload as any).workspaces;
    const result = validateThresholdConfig(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.workspaces).toBeUndefined();
    }
  });

  it("accepts payload with null workspaces", () => {
    const result = validateThresholdConfig(makeValidPayload({ workspaces: null as any }));
    expect(result.ok).toBe(true);
  });

  it("accepts payload with empty workspaces object", () => {
    const result = validateThresholdConfig(makeValidPayload({ workspaces: {} }));
    expect(result.ok).toBe(true);
  });
});

// --- formatValidationErrors ---

describe("formatValidationErrors", () => {
  it("returns single error message directly", () => {
    expect(formatValidationErrors([{ path: "$.foo", message: "bad" }])).toBe("bad");
  });

  it("formats multiple errors with paths", () => {
    const msg = formatValidationErrors([
      { path: "$.a", message: "missing" },
      { path: "$.b", message: "wrong type" },
    ]);
    expect(msg).toContain("$.a: missing");
    expect(msg).toContain("$.b: wrong type");
  });
});

// --- parseThresholdConfig ---

describe("parseThresholdConfig", () => {
  it("parses valid JSON string", () => {
    const json = JSON.stringify(makeValidPayload());
    const result = parseThresholdConfig(json);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid JSON syntax", () => {
    const result = parseThresholdConfig("{not valid json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Invalid JSON");
  });

  it("rejects valid JSON with bad schema", () => {
    const result = parseThresholdConfig(JSON.stringify({ foo: "bar" }));
    expect(result.ok).toBe(false);
  });
});

// --- Export payload ---

describe("buildThresholdExportPayload", () => {
  it("exports global defaults when no custom settings", () => {
    const payload = buildThresholdExportPayload();
    expect(payload.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(payload.kind).toBe(CONFIG_KIND);
    expect(payload.defaults).toEqual(DEFAULT_THRESHOLD_SETTINGS);
    expect(payload.workspaces).toBeUndefined();
    expect(payload.exportedAt).toBeTruthy();
  });

  it("exports custom global settings", () => {
    const custom: HealthThresholdSettings = { goodMinScans7d: 5, goodMaxAgeDays: 3, poorMaxAgeDays: 10 };
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(custom));
    const payload = buildThresholdExportPayload();
    expect(payload.defaults).toEqual(custom);
  });

  it("includes workspace overrides in export", () => {
    const wsSettings: HealthThresholdSettings = { goodMinScans7d: 4, goodMaxAgeDays: 2, poorMaxAgeDays: 8 };
    localStorage.setItem(WS_PREFIX + WS_A, JSON.stringify(wsSettings));
    const payload = buildThresholdExportPayload();
    expect(payload.workspaces).toBeDefined();
    expect(payload.workspaces?.[WS_A]).toEqual(wsSettings);
  });

  it("exports multiple workspace overrides", () => {
    const wsA: HealthThresholdSettings = { goodMinScans7d: 4, goodMaxAgeDays: 2, poorMaxAgeDays: 8 };
    const wsB: HealthThresholdSettings = { goodMinScans7d: 1, goodMaxAgeDays: 10, poorMaxAgeDays: 20 };
    localStorage.setItem(WS_PREFIX + WS_A, JSON.stringify(wsA));
    localStorage.setItem(WS_PREFIX + WS_B, JSON.stringify(wsB));
    const payload = buildThresholdExportPayload();
    expect(payload.workspaces?.[WS_A]).toEqual(wsA);
    expect(payload.workspaces?.[WS_B]).toEqual(wsB);
  });
});

describe("serializeThresholdConfig", () => {
  it("produces valid parseable JSON", () => {
    const payload = makeValidPayload();
    const json = serializeThresholdConfig(payload);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.kind).toBe(CONFIG_KIND);
  });

  it("roundtrips through parse + validate", () => {
    const payload = makeValidPayload({
      workspaces: { [WS_A]: { goodMinScans7d: 3, goodMaxAgeDays: 5, poorMaxAgeDays: 12 } },
    });
    const json = serializeThresholdConfig(payload);
    const result = parseThresholdConfig(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.defaults).toEqual(payload.defaults);
      expect(result.payload.workspaces?.[WS_A]).toEqual(payload.workspaces?.[WS_A]);
    }
  });
});

// --- Import / apply ---

describe("applyThresholdConfig", () => {
  it("persists global defaults on import", () => {
    const custom: HealthThresholdSettings = { goodMinScans7d: 5, goodMaxAgeDays: 3, poorMaxAgeDays: 10 };
    applyThresholdConfig(makeValidPayload({ defaults: custom }));
    const stored = JSON.parse(localStorage.getItem(GLOBAL_KEY)!);
    expect(stored).toEqual(custom);
  });

  it("persists workspace overrides on import", () => {
    const wsSettings: HealthThresholdSettings = { goodMinScans7d: 4, goodMaxAgeDays: 2, poorMaxAgeDays: 8 };
    applyThresholdConfig(makeValidPayload({ workspaces: { [WS_A]: wsSettings } }));
    const stored = JSON.parse(localStorage.getItem(WS_PREFIX + WS_A)!);
    expect(stored).toEqual(wsSettings);
  });

  it("returns the applied defaults", () => {
    const custom: HealthThresholdSettings = { goodMinScans7d: 5, goodMaxAgeDays: 3, poorMaxAgeDays: 10 };
    const result = applyThresholdConfig(makeValidPayload({ defaults: custom }));
    expect(result).toEqual(custom);
  });

  it("does not clear existing workspace overrides not in payload", () => {
    // Pre-existing workspace override
    const existing: HealthThresholdSettings = { goodMinScans7d: 1, goodMaxAgeDays: 10, poorMaxAgeDays: 20 };
    localStorage.setItem(WS_PREFIX + WS_B, JSON.stringify(existing));

    // Import with only WS_A
    const wsA: HealthThresholdSettings = { goodMinScans7d: 4, goodMaxAgeDays: 2, poorMaxAgeDays: 8 };
    applyThresholdConfig(makeValidPayload({ workspaces: { [WS_A]: wsA } }));

    // WS_B should still exist (additive merge)
    expect(JSON.parse(localStorage.getItem(WS_PREFIX + WS_B)!)).toEqual(existing);
    expect(JSON.parse(localStorage.getItem(WS_PREFIX + WS_A)!)).toEqual(wsA);
  });

  it("overwrites existing global settings", () => {
    const old: HealthThresholdSettings = { goodMinScans7d: 1, goodMaxAgeDays: 1, poorMaxAgeDays: 3 };
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(old));

    const newSettings: HealthThresholdSettings = { goodMinScans7d: 8, goodMaxAgeDays: 5, poorMaxAgeDays: 15 };
    applyThresholdConfig(makeValidPayload({ defaults: newSettings }));
    expect(JSON.parse(localStorage.getItem(GLOBAL_KEY)!)).toEqual(newSettings);
  });
});

// --- Full roundtrip: export → import ---

describe("export → import roundtrip", () => {
  it("roundtrips global + workspace config", () => {
    // Setup: custom global + workspace override
    const globalSettings: HealthThresholdSettings = { goodMinScans7d: 3, goodMaxAgeDays: 5, poorMaxAgeDays: 12 };
    const wsSettings: HealthThresholdSettings = { goodMinScans7d: 7, goodMaxAgeDays: 2, poorMaxAgeDays: 9 };
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(globalSettings));
    localStorage.setItem(WS_PREFIX + WS_A, JSON.stringify(wsSettings));

    // Export
    const payload = buildThresholdExportPayload();
    const json = serializeThresholdConfig(payload);

    // Clear and reimport
    localStorage.clear();
    const parseResult = parseThresholdConfig(json);
    expect(parseResult.ok).toBe(true);
    if (parseResult.ok) {
      applyThresholdConfig(parseResult.payload);
    }

    // Verify
    expect(JSON.parse(localStorage.getItem(GLOBAL_KEY)!)).toEqual(globalSettings);
    expect(JSON.parse(localStorage.getItem(WS_PREFIX + WS_A)!)).toEqual(wsSettings);
  });
});
