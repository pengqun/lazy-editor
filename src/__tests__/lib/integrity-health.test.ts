import type { IntegrityScanSnapshot } from "@/stores/knowledge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type HealthThresholdSettings,
  type ScanCoverageMetrics,
  DEFAULT_THRESHOLD_SETTINGS,
  clampThresholdSettings,
  computeHealthTier,
  computeScanCoverage,
  computeStreak,
  formatAge,
  loadThresholdSettings,
  saveThresholdSettings,
  toHealthThresholds,
} from "../../lib/integrity-health";

function makeSnapshot(overrides?: Partial<IntegrityScanSnapshot>): IntegrityScanSnapshot {
  return {
    id: 1,
    scannedAt: "2026-03-12T10:00:00",
    total: 10,
    healthy: 8,
    missing: 1,
    moved: 1,
    notes: null,
    ...overrides,
  };
}

// --- computeScanCoverage ---

describe("computeScanCoverage", () => {
  const now = new Date("2026-03-12T12:00:00Z");

  it("returns zeros for empty history", () => {
    const metrics = computeScanCoverage([], now);
    expect(metrics).toEqual({
      scansLast7d: 0,
      scansLast30d: 0,
      latestScanAgeMs: null,
      streak: 0,
    });
  });

  it("counts scans within 7d window", () => {
    const history = [
      makeSnapshot({ id: 3, scannedAt: "2026-03-12T08:00:00" }), // today
      makeSnapshot({ id: 2, scannedAt: "2026-03-10T08:00:00" }), // 2 days ago
      makeSnapshot({ id: 1, scannedAt: "2026-03-01T08:00:00" }), // 11 days ago
    ];
    const metrics = computeScanCoverage(history, now);
    expect(metrics.scansLast7d).toBe(2);
    expect(metrics.scansLast30d).toBe(3);
  });

  it("counts scans within 30d window", () => {
    const history = [
      makeSnapshot({ id: 2, scannedAt: "2026-03-01T08:00:00" }), // 11 days ago
      makeSnapshot({ id: 1, scannedAt: "2026-02-01T08:00:00" }), // 39 days ago
    ];
    const metrics = computeScanCoverage(history, now);
    expect(metrics.scansLast7d).toBe(0);
    expect(metrics.scansLast30d).toBe(1);
  });

  it("computes latest scan age correctly", () => {
    const history = [
      makeSnapshot({ id: 1, scannedAt: "2026-03-12T08:00:00" }), // 4 hours ago
    ];
    const metrics = computeScanCoverage(history, now);
    expect(metrics.latestScanAgeMs).toBe(4 * 60 * 60 * 1000);
  });

  it("handles single scan", () => {
    const history = [makeSnapshot({ id: 1, scannedAt: "2026-03-12T12:00:00" })];
    const metrics = computeScanCoverage(history, now);
    expect(metrics.scansLast7d).toBe(1);
    expect(metrics.scansLast30d).toBe(1);
    expect(metrics.latestScanAgeMs).toBe(0);
    expect(metrics.streak).toBe(1);
  });
});

// --- computeStreak ---

describe("computeStreak", () => {
  const now = new Date("2026-03-12T12:00:00Z");

  it("returns 0 for empty timestamps", () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it("returns 1 for a scan today", () => {
    const ts = [new Date("2026-03-12T08:00:00Z").getTime()];
    expect(computeStreak(ts, now)).toBe(1);
  });

  it("returns 1 for a scan yesterday only (no scan today)", () => {
    const ts = [new Date("2026-03-11T08:00:00Z").getTime()];
    expect(computeStreak(ts, now)).toBe(1);
  });

  it("counts consecutive days including today", () => {
    const ts = [
      new Date("2026-03-12T08:00:00Z").getTime(), // today
      new Date("2026-03-11T08:00:00Z").getTime(), // yesterday
      new Date("2026-03-10T08:00:00Z").getTime(), // 2 days ago
    ];
    expect(computeStreak(ts, now)).toBe(3);
  });

  it("breaks streak on gap", () => {
    const ts = [
      new Date("2026-03-12T08:00:00Z").getTime(), // today
      new Date("2026-03-11T08:00:00Z").getTime(), // yesterday
      // gap on March 10
      new Date("2026-03-09T08:00:00Z").getTime(), // 3 days ago
    ];
    expect(computeStreak(ts, now)).toBe(2);
  });

  it("deduplicates multiple scans on same day", () => {
    const ts = [
      new Date("2026-03-12T14:00:00Z").getTime(),
      new Date("2026-03-12T08:00:00Z").getTime(),
      new Date("2026-03-11T08:00:00Z").getTime(),
    ];
    expect(computeStreak(ts, now)).toBe(2);
  });

  it("returns 0 when scan is 2+ days ago with no scan today or yesterday", () => {
    const ts = [new Date("2026-03-09T08:00:00Z").getTime()];
    expect(computeStreak(ts, now)).toBe(0);
  });
});

// --- computeHealthTier ---

describe("computeHealthTier", () => {
  it("returns 'poor' when never scanned", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 0,
      scansLast30d: 0,
      latestScanAgeMs: null,
      streak: 0,
    };
    expect(computeHealthTier(metrics)).toBe("poor");
  });

  it("returns 'good' with sufficient recent scans", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 3,
      scansLast30d: 10,
      latestScanAgeMs: 2 * 60 * 60 * 1000, // 2 hours
      streak: 3,
    };
    expect(computeHealthTier(metrics)).toBe("good");
  });

  it("returns 'warning' with exactly 1 scan in 7d", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 1,
      scansLast30d: 2,
      latestScanAgeMs: 5 * 24 * 60 * 60 * 1000, // 5 days
      streak: 1,
    };
    expect(computeHealthTier(metrics)).toBe("warning");
  });

  it("returns 'poor' when latest scan is older than warning threshold", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 0,
      scansLast30d: 1,
      latestScanAgeMs: 15 * 24 * 60 * 60 * 1000, // 15 days
      streak: 0,
    };
    expect(computeHealthTier(metrics)).toBe("poor");
  });

  it("returns 'warning' when 0 scans in 7d but age within warning range", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 0,
      scansLast30d: 3,
      latestScanAgeMs: 6 * 24 * 60 * 60 * 1000, // 6 days — within goodMaxAge
      streak: 0,
    };
    expect(computeHealthTier(metrics)).toBe("warning");
  });

  it("respects custom thresholds", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 5,
      scansLast30d: 20,
      latestScanAgeMs: 1 * 60 * 60 * 1000, // 1 hour
      streak: 5,
    };
    const strict = {
      good7d: 7,
      warning7d: 3,
      goodMaxAgeMs: 12 * 60 * 60 * 1000, // 12 hours
      warningMaxAgeMs: 24 * 60 * 60 * 1000,
    };
    // 5 < 7 required for good, but within goodMaxAge → warning
    expect(computeHealthTier(metrics, strict)).toBe("warning");
  });

  it("returns 'good' at exact threshold boundary", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 2, // exactly good7d
      scansLast30d: 4,
      latestScanAgeMs: 7 * 24 * 60 * 60 * 1000, // exactly goodMaxAgeMs
      streak: 2,
    };
    expect(computeHealthTier(metrics)).toBe("good");
  });
});

// --- formatAge ---

describe("formatAge", () => {
  it("formats < 60 seconds as 'just now'", () => {
    expect(formatAge(30_000)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(formatAge(5 * 60 * 1000)).toBe("5m ago");
  });

  it("formats hours", () => {
    expect(formatAge(3 * 60 * 60 * 1000)).toBe("3h ago");
  });

  it("formats 1 day", () => {
    expect(formatAge(24 * 60 * 60 * 1000)).toBe("1d ago");
  });

  it("formats multiple days", () => {
    expect(formatAge(10 * 24 * 60 * 60 * 1000)).toBe("10d ago");
  });

  it("formats 0 ms as 'just now'", () => {
    expect(formatAge(0)).toBe("just now");
  });
});

// --- clampThresholdSettings ---

describe("clampThresholdSettings", () => {
  it("passes through valid defaults unchanged", () => {
    const result = clampThresholdSettings(DEFAULT_THRESHOLD_SETTINGS);
    expect(result).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });

  it("clamps goodMinScans7d to [1, 10]", () => {
    expect(clampThresholdSettings({ ...DEFAULT_THRESHOLD_SETTINGS, goodMinScans7d: 0 }).goodMinScans7d).toBe(1);
    expect(clampThresholdSettings({ ...DEFAULT_THRESHOLD_SETTINGS, goodMinScans7d: -5 }).goodMinScans7d).toBe(1);
    expect(clampThresholdSettings({ ...DEFAULT_THRESHOLD_SETTINGS, goodMinScans7d: 15 }).goodMinScans7d).toBe(10);
  });

  it("clamps goodMaxAgeDays to [1, 30]", () => {
    expect(clampThresholdSettings({ ...DEFAULT_THRESHOLD_SETTINGS, goodMaxAgeDays: 0 }).goodMaxAgeDays).toBe(1);
    expect(clampThresholdSettings({ ...DEFAULT_THRESHOLD_SETTINGS, goodMaxAgeDays: 50 }).goodMaxAgeDays).toBe(30);
  });

  it("clamps poorMaxAgeDays to [goodMaxAgeDays+1, 60]", () => {
    expect(clampThresholdSettings({ ...DEFAULT_THRESHOLD_SETTINGS, poorMaxAgeDays: 1 }).poorMaxAgeDays).toBe(8); // 7+1
    expect(clampThresholdSettings({ ...DEFAULT_THRESHOLD_SETTINGS, poorMaxAgeDays: 100 }).poorMaxAgeDays).toBe(60);
  });

  it("enforces poorMaxAgeDays > goodMaxAgeDays", () => {
    const result = clampThresholdSettings({ goodMinScans7d: 2, goodMaxAgeDays: 10, poorMaxAgeDays: 10 });
    expect(result.poorMaxAgeDays).toBe(11); // must be > 10
  });

  it("rounds fractional values", () => {
    const result = clampThresholdSettings({ goodMinScans7d: 2.7, goodMaxAgeDays: 7.3, poorMaxAgeDays: 14.9 });
    expect(result.goodMinScans7d).toBe(3);
    expect(result.goodMaxAgeDays).toBe(7);
    expect(result.poorMaxAgeDays).toBe(15);
  });

  it("handles NaN by clamping to min", () => {
    const result = clampThresholdSettings({ goodMinScans7d: NaN, goodMaxAgeDays: NaN, poorMaxAgeDays: NaN });
    expect(result.goodMinScans7d).toBe(1);
    expect(result.goodMaxAgeDays).toBe(1);
    expect(result.poorMaxAgeDays).toBe(2); // 1 + 1
  });
});

// --- toHealthThresholds ---

describe("toHealthThresholds", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("converts default settings to default thresholds", () => {
    const result = toHealthThresholds(DEFAULT_THRESHOLD_SETTINGS);
    expect(result).toEqual({
      good7d: 2,
      warning7d: 1,
      goodMaxAgeMs: 7 * DAY_MS,
      warningMaxAgeMs: 14 * DAY_MS,
    });
  });

  it("converts custom settings correctly", () => {
    const result = toHealthThresholds({ goodMinScans7d: 5, goodMaxAgeDays: 3, poorMaxAgeDays: 10 });
    expect(result.good7d).toBe(5);
    expect(result.warning7d).toBe(1);
    expect(result.goodMaxAgeMs).toBe(3 * DAY_MS);
    expect(result.warningMaxAgeMs).toBe(10 * DAY_MS);
  });
});

// --- Threshold persistence ---

describe("threshold persistence", () => {
  const STORAGE_KEY = "lazy-editor:integrity-health-thresholds";

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("loads defaults when nothing stored", () => {
    const result = loadThresholdSettings();
    expect(result).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });

  it("roundtrips save + load", () => {
    const settings: HealthThresholdSettings = { goodMinScans7d: 5, goodMaxAgeDays: 3, poorMaxAgeDays: 10 };
    saveThresholdSettings(settings);
    const loaded = loadThresholdSettings();
    expect(loaded).toEqual(settings);
  });

  it("clamps invalid values on load", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ goodMinScans7d: 99, goodMaxAgeDays: -1, poorMaxAgeDays: 0 }));
    const loaded = loadThresholdSettings();
    expect(loaded.goodMinScans7d).toBe(10);
    expect(loaded.goodMaxAgeDays).toBe(1);
    expect(loaded.poorMaxAgeDays).toBe(2); // 1 + 1
  });

  it("returns defaults for corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(loadThresholdSettings()).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });

  it("returns defaults for non-object JSON", () => {
    localStorage.setItem(STORAGE_KEY, "42");
    expect(loadThresholdSettings()).toEqual(DEFAULT_THRESHOLD_SETTINGS);
  });

  it("falls back missing fields to defaults", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ goodMinScans7d: 4 }));
    const loaded = loadThresholdSettings();
    expect(loaded.goodMinScans7d).toBe(4);
    expect(loaded.goodMaxAgeDays).toBe(DEFAULT_THRESHOLD_SETTINGS.goodMaxAgeDays);
    expect(loaded.poorMaxAgeDays).toBe(DEFAULT_THRESHOLD_SETTINGS.poorMaxAgeDays);
  });
});

// --- Status recomputation with custom thresholds ---

describe("computeHealthTier with user-facing settings", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("strict settings demote tier", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 2,
      scansLast30d: 5,
      latestScanAgeMs: 2 * DAY_MS,
      streak: 2,
    };
    // With defaults → good (2 >= 2, 2d <= 7d)
    expect(computeHealthTier(metrics)).toBe("good");
    // Strict: require 5 scans and max 1 day age
    const strict = toHealthThresholds({ goodMinScans7d: 5, goodMaxAgeDays: 1, poorMaxAgeDays: 3 });
    expect(computeHealthTier(metrics, strict)).toBe("warning"); // 2 < 5, but age 2d <= 3d poorMax, and 2d > 1d goodMax
  });

  it("relaxed settings promote tier", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 1,
      scansLast30d: 2,
      latestScanAgeMs: 10 * DAY_MS,
      streak: 0,
    };
    // With defaults → warning (10d > 7d goodMax, but 10d < 14d poorMax, 1 scan >= warning7d)
    expect(computeHealthTier(metrics)).toBe("warning");
    // Relaxed: good within 20 days, poor after 30 days
    const relaxed = toHealthThresholds({ goodMinScans7d: 1, goodMaxAgeDays: 20, poorMaxAgeDays: 30 });
    expect(computeHealthTier(metrics, relaxed)).toBe("good"); // 1 >= 1, 10d <= 20d
  });

  it("threshold change flips from warning to poor", () => {
    const metrics: ScanCoverageMetrics = {
      scansLast7d: 1,
      scansLast30d: 2,
      latestScanAgeMs: 10 * DAY_MS,
      streak: 0,
    };
    // Defaults: scans7d(1) >= warning7d(1) → warning (even though 10d > 7d goodMax, still under 14d poorMax)
    expect(computeHealthTier(metrics)).toBe("warning");
    // Tighten poor threshold to 8 days
    const tighter = toHealthThresholds({ goodMinScans7d: 2, goodMaxAgeDays: 5, poorMaxAgeDays: 8 });
    expect(computeHealthTier(metrics, tighter)).toBe("poor"); // 10d > 8d poorMax
  });
});
