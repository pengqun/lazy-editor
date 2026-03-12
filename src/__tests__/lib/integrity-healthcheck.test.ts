import type { IntegrityReport, IntegrityScanSnapshot } from "@/stores/knowledge";
import { describe, expect, it } from "vitest";
import {
  type HealthCheckRecommendation,
  type HealthCheckReport,
  buildHealthCheckReport,
  generateRecommendations,
} from "../../lib/integrity-healthcheck";
import type { HealthThresholdSettings, ScanCoverageMetrics } from "../../lib/integrity-health";
import type { IntegrityReminderSettings } from "../../lib/integrity-reminder";

// --- Helpers ---

function makeReport(overrides?: Partial<IntegrityReport>): IntegrityReport {
  return {
    entries: [],
    healthy: 10,
    missing: 0,
    moved: 0,
    ...overrides,
  };
}

function makeMetrics(overrides?: Partial<ScanCoverageMetrics>): ScanCoverageMetrics {
  return {
    scansLast7d: 3,
    scansLast30d: 10,
    latestScanAgeMs: 2 * 60 * 60 * 1000, // 2h ago
    streak: 5,
    ...overrides,
  };
}

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

const DEFAULT_REMINDER: IntegrityReminderSettings = {
  enabled: true,
  frequency: "weekly",
  snoozedUntil: null,
};

const DEFAULT_THRESHOLDS: HealthThresholdSettings = {
  goodMinScans7d: 2,
  goodMaxAgeDays: 7,
  poorMaxAgeDays: 14,
};

function findRec(recs: HealthCheckRecommendation[], id: string) {
  return recs.find((r) => r.id === id);
}

// --- generateRecommendations ---

describe("generateRecommendations", () => {
  it("recommends relinking moved documents", () => {
    const report = makeReport({
      moved: 3,
      entries: [
        { id: 1, title: "a", sourcePath: "/a", status: "moved", movedCandidate: "/b" },
        { id: 2, title: "b", sourcePath: "/b", status: "moved", movedCandidate: "/c" },
        { id: 3, title: "c", sourcePath: "/c", status: "moved", movedCandidate: "/d" },
      ],
    });
    const recs = generateRecommendations(report, makeMetrics(), "good", DEFAULT_REMINDER);
    const rec = findRec(recs, "relink-moved");
    expect(rec).toBeDefined();
    expect(rec!.priority).toBe("high");
    expect(rec!.action).toEqual({ type: "relink-all" });
    expect(rec!.title).toContain("3");
  });

  it("recommends removing missing documents", () => {
    const report = makeReport({
      missing: 2,
      entries: [
        { id: 10, title: "x", sourcePath: "/x", status: "missing", movedCandidate: null },
        { id: 11, title: "y", sourcePath: "/y", status: "missing", movedCandidate: null },
      ],
    });
    const recs = generateRecommendations(report, makeMetrics(), "good", DEFAULT_REMINDER);
    const rec = findRec(recs, "remove-missing");
    expect(rec).toBeDefined();
    expect(rec!.priority).toBe("medium");
    expect(rec!.action).toEqual({ type: "remove-stale", ids: [10, 11] });
  });

  it("marks many missing as high priority", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      title: `doc-${i}`,
      sourcePath: `/doc-${i}`,
      status: "missing" as const,
      movedCandidate: null,
    }));
    const report = makeReport({ missing: 5, entries });
    const recs = generateRecommendations(report, makeMetrics(), "good", DEFAULT_REMINDER);
    expect(findRec(recs, "remove-missing")!.priority).toBe("high");
  });

  it("recommends enabling reminders when disabled and tier is not good", () => {
    const reminder: IntegrityReminderSettings = { enabled: false, frequency: "weekly", snoozedUntil: null };
    const recs = generateRecommendations(makeReport(), makeMetrics(), "warning", reminder);
    const rec = findRec(recs, "enable-reminders");
    expect(rec).toBeDefined();
    expect(rec!.action).toEqual({ type: "enable-reminders" });
  });

  it("does not recommend enabling reminders when tier is good", () => {
    const reminder: IntegrityReminderSettings = { enabled: false, frequency: "weekly", snoozedUntil: null };
    const recs = generateRecommendations(makeReport(), makeMetrics(), "good", reminder);
    expect(findRec(recs, "enable-reminders")).toBeUndefined();
  });

  it("recommends adjusting frequency when tier is poor and reminders enabled", () => {
    const reminder: IntegrityReminderSettings = { enabled: true, frequency: "weekly", snoozedUntil: null };
    const recs = generateRecommendations(makeReport(), makeMetrics(), "poor", reminder);
    const rec = findRec(recs, "adjust-frequency");
    expect(rec).toBeDefined();
    expect(rec!.action).toEqual({ type: "adjust-frequency", suggested: "every3days" });
  });

  it("does not suggest more frequent than daily", () => {
    const reminder: IntegrityReminderSettings = { enabled: true, frequency: "daily", snoozedUntil: null };
    const recs = generateRecommendations(makeReport(), makeMetrics(), "poor", reminder);
    expect(findRec(recs, "adjust-frequency")).toBeUndefined();
  });

  it("recommends setting up scanning when never scanned", () => {
    const metrics = makeMetrics({ latestScanAgeMs: null });
    const recs = generateRecommendations(makeReport(), metrics, "poor", DEFAULT_REMINDER);
    expect(findRec(recs, "never-scanned")).toBeDefined();
  });

  it("recommends increasing scan frequency when tier is poor with old scan", () => {
    const metrics = makeMetrics({ latestScanAgeMs: 20 * 24 * 60 * 60 * 1000 });
    const recs = generateRecommendations(makeReport(), metrics, "poor", DEFAULT_REMINDER);
    expect(findRec(recs, "scan-stale")).toBeDefined();
  });

  it("warns about low health ratio", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      title: `doc-${i}`,
      sourcePath: `/doc-${i}`,
      status: i < 3 ? ("healthy" as const) : ("missing" as const),
      movedCandidate: null,
    }));
    const report = makeReport({ healthy: 3, missing: 7, entries });
    const recs = generateRecommendations(report, makeMetrics(), "good", DEFAULT_REMINDER);
    expect(findRec(recs, "low-health-ratio")).toBeDefined();
  });

  it("warns about moderate health ratio", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      title: `doc-${i}`,
      sourcePath: `/doc-${i}`,
      status: i < 6 ? ("healthy" as const) : ("missing" as const),
      movedCandidate: null,
    }));
    const report = makeReport({ healthy: 6, missing: 4, entries });
    const recs = generateRecommendations(report, makeMetrics(), "good", DEFAULT_REMINDER);
    expect(findRec(recs, "moderate-health-ratio")).toBeDefined();
  });

  it("returns all-clear when everything is good", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      title: `doc-${i}`,
      sourcePath: `/doc-${i}`,
      status: "healthy" as const,
      movedCandidate: null,
    }));
    const report = makeReport({ healthy: 5, entries });
    const recs = generateRecommendations(report, makeMetrics(), "good", DEFAULT_REMINDER);
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("all-clear");
    expect(recs[0].priority).toBe("info");
  });
});

// --- buildHealthCheckReport ---

describe("buildHealthCheckReport", () => {
  const now = new Date("2026-03-12T12:00:00Z");

  it("builds a complete report from scan results and history", () => {
    const report = makeReport({
      healthy: 8,
      missing: 1,
      moved: 1,
      entries: [
        { id: 1, title: "a", sourcePath: "/a", status: "healthy", movedCandidate: null },
        { id: 2, title: "b", sourcePath: "/b", status: "missing", movedCandidate: null },
        { id: 3, title: "c", sourcePath: "/c", status: "moved", movedCandidate: "/d" },
        ...Array.from({ length: 7 }, (_, i) => ({
          id: i + 4,
          title: `doc-${i + 4}`,
          sourcePath: `/doc-${i + 4}`,
          status: "healthy" as const,
          movedCandidate: null,
        })),
      ],
    });
    const history = [
      makeSnapshot({ id: 3, scannedAt: "2026-03-12T08:00:00" }),
      makeSnapshot({ id: 2, scannedAt: "2026-03-10T08:00:00" }),
      makeSnapshot({ id: 1, scannedAt: "2026-03-05T08:00:00" }),
    ];

    const hcReport = buildHealthCheckReport(report, history, DEFAULT_THRESHOLDS, DEFAULT_REMINDER, now);

    expect(hcReport.tier).toBe("good");
    expect(hcReport.counts).toEqual({ total: 10, healthy: 8, missing: 1, moved: 1 });
    expect(hcReport.metrics.scansLast7d).toBe(2);
    expect(hcReport.recommendations.length).toBeGreaterThan(0);
    expect(hcReport.timestamp).toBe("2026-03-12T12:00:00.000Z");
    // Should have relink + remove recommendations
    expect(hcReport.recommendations.some((r) => r.id === "relink-moved")).toBe(true);
    expect(hcReport.recommendations.some((r) => r.id === "remove-missing")).toBe(true);
  });

  it("computes poor tier for empty history", () => {
    const report = makeReport({ healthy: 5, entries: Array.from({ length: 5 }, (_, i) => ({
      id: i,
      title: `d-${i}`,
      sourcePath: `/d-${i}`,
      status: "healthy" as const,
      movedCandidate: null,
    })) });

    const hcReport = buildHealthCheckReport(report, [], DEFAULT_THRESHOLDS, DEFAULT_REMINDER, now);
    expect(hcReport.tier).toBe("poor");
    expect(hcReport.metrics.latestScanAgeMs).toBeNull();
  });

  it("includes correct timestamp", () => {
    const hcReport = buildHealthCheckReport(makeReport(), [], DEFAULT_THRESHOLDS, DEFAULT_REMINDER, now);
    expect(hcReport.timestamp).toBe("2026-03-12T12:00:00.000Z");
  });
});
