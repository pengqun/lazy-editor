import {
  type IntegrityExportPayload,
  buildExportPayload,
  computeTrend,
  formatDelta,
  formatJSON,
  formatMarkdown,
} from "@/lib/integrity-export";
import type { IntegrityReport, IntegrityScanSnapshot } from "@/stores/knowledge";
import { describe, expect, it } from "vitest";

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

function makeReport(overrides?: Partial<IntegrityReport>): IntegrityReport {
  return {
    entries: [],
    healthy: 0,
    missing: 0,
    moved: 0,
    ...overrides,
  };
}

function makePayload(overrides?: Partial<IntegrityExportPayload>): IntegrityExportPayload {
  return {
    scanTimestamp: "2026-03-12T10:00:00.000Z",
    summary: { total: 0, healthy: 0, missing: 0, moved: 0 },
    entries: [],
    ...overrides,
  };
}

describe("buildExportPayload", () => {
  it("builds payload from an empty report", () => {
    const report = makeReport();
    const payload = buildExportPayload(report);
    expect(payload.summary).toEqual({ total: 0, healthy: 0, missing: 0, moved: 0 });
    expect(payload.entries).toEqual([]);
    expect(payload.scanTimestamp).toBeTruthy();
  });

  it("builds payload with mixed entries", () => {
    const report = makeReport({
      healthy: 2,
      missing: 1,
      moved: 1,
      entries: [
        { id: 1, title: "A", sourcePath: "/a.txt", status: "healthy", movedCandidate: null },
        { id: 2, title: "B", sourcePath: "/b.txt", status: "healthy", movedCandidate: null },
        { id: 3, title: "C", sourcePath: "/c.txt", status: "moved", movedCandidate: "/new/c.txt" },
        { id: 4, title: "D", sourcePath: "/d.txt", status: "missing", movedCandidate: null },
      ],
    });
    const payload = buildExportPayload(report);
    expect(payload.summary).toEqual({ total: 4, healthy: 2, missing: 1, moved: 1 });
    expect(payload.entries).toHaveLength(4);
  });

  it("includes an ISO timestamp", () => {
    const payload = buildExportPayload(makeReport());
    expect(() => new Date(payload.scanTimestamp)).not.toThrow();
    expect(new Date(payload.scanTimestamp).toISOString()).toBe(payload.scanTimestamp);
  });
});

describe("formatJSON", () => {
  it("produces valid parseable JSON", () => {
    const payload = makePayload();
    const json = formatJSON(payload);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("roundtrips payload data", () => {
    const payload = makePayload({
      summary: { total: 3, healthy: 1, missing: 1, moved: 1 },
      entries: [
        { id: 1, title: "Doc", sourcePath: "/doc.md", status: "healthy", movedCandidate: null },
        { id: 2, title: "Gone", sourcePath: "/gone.md", status: "missing", movedCandidate: null },
        { id: 3, title: "Moved", sourcePath: "/old.md", status: "moved", movedCandidate: "/new.md" },
      ],
    });
    const parsed = JSON.parse(formatJSON(payload));
    expect(parsed.summary).toEqual(payload.summary);
    expect(parsed.entries).toEqual(payload.entries);
    expect(parsed.scanTimestamp).toBe(payload.scanTimestamp);
  });

  it("uses pretty-printed format", () => {
    const json = formatJSON(makePayload());
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });
});

describe("formatMarkdown", () => {
  it("includes header and timestamp", () => {
    const md = formatMarkdown(makePayload());
    expect(md).toContain("# KB Integrity Report");
    expect(md).toContain("2026-03-12T10:00:00.000Z");
  });

  it("includes summary table with counts", () => {
    const md = formatMarkdown(
      makePayload({ summary: { total: 5, healthy: 3, missing: 1, moved: 1 } }),
    );
    expect(md).toContain("| Healthy | 3 |");
    expect(md).toContain("| Moved | 1 |");
    expect(md).toContain("| Missing | 1 |");
    expect(md).toContain("| **Total** | **5** |");
  });

  it("shows no-documents message for empty entries", () => {
    const md = formatMarkdown(makePayload());
    expect(md).toContain("_No documents scanned._");
    expect(md).not.toContain("## Documents");
  });

  it("includes document table rows", () => {
    const md = formatMarkdown(
      makePayload({
        summary: { total: 2, healthy: 1, missing: 1, moved: 0 },
        entries: [
          { id: 1, title: "My Doc", sourcePath: "/path/doc.md", status: "healthy", movedCandidate: null },
          { id: 2, title: "Lost", sourcePath: "/old/lost.md", status: "missing", movedCandidate: null },
        ],
      }),
    );
    expect(md).toContain("## Documents");
    expect(md).toContain("| 1 | My Doc | /path/doc.md | healthy |  |");
    expect(md).toContain("| 2 | Lost | /old/lost.md | missing |  |");
  });

  it("includes moved candidate in notes column", () => {
    const md = formatMarkdown(
      makePayload({
        summary: { total: 1, healthy: 0, missing: 0, moved: 1 },
        entries: [
          { id: 5, title: "Moved", sourcePath: "/old/f.md", status: "moved", movedCandidate: "/new/f.md" },
        ],
      }),
    );
    expect(md).toContain("Candidate: /new/f.md");
  });

  it("escapes pipe characters in titles and paths", () => {
    const md = formatMarkdown(
      makePayload({
        summary: { total: 1, healthy: 1, missing: 0, moved: 0 },
        entries: [
          { id: 1, title: "A|B", sourcePath: "/a|b.md", status: "healthy", movedCandidate: null },
        ],
      }),
    );
    expect(md).toContain("A\\|B");
    expect(md).toContain("/a\\|b.md");
  });

  it("includes scan history section when provided", () => {
    const history: IntegrityScanSnapshot[] = [
      makeSnapshot({ id: 2, scannedAt: "2026-03-12T11:00:00", total: 12, healthy: 10, missing: 1, moved: 1 }),
      makeSnapshot({ id: 1, scannedAt: "2026-03-12T10:00:00", total: 10, healthy: 8, missing: 1, moved: 1, notes: "initial" }),
    ];
    const md = formatMarkdown(makePayload({ history }));
    expect(md).toContain("## Scan History");
    expect(md).toContain("| 1 | 2026-03-12T11:00:00 | 12 | 10 | 1 | 1 |  |");
    expect(md).toContain("| 2 | 2026-03-12T10:00:00 | 10 | 8 | 1 | 1 | initial |");
  });

  it("omits scan history section when history is empty", () => {
    const md = formatMarkdown(makePayload({ history: [] }));
    expect(md).not.toContain("## Scan History");
  });
});

describe("computeTrend", () => {
  it("returns null for empty history", () => {
    expect(computeTrend([])).toBeNull();
  });

  it("returns null for single-entry history", () => {
    expect(computeTrend([makeSnapshot()])).toBeNull();
  });

  it("computes deltas between latest and previous", () => {
    const history = [
      makeSnapshot({ healthy: 10, missing: 2, moved: 1, total: 13 }),
      makeSnapshot({ healthy: 8, missing: 3, moved: 2, total: 13 }),
    ];
    const trend = computeTrend(history);
    expect(trend).toEqual({
      healthyDelta: 2,
      missingDelta: -1,
      movedDelta: -1,
      totalDelta: 0,
    });
  });

  it("handles all-zero deltas", () => {
    const snap = makeSnapshot();
    const trend = computeTrend([snap, snap]);
    expect(trend).toEqual({
      healthyDelta: 0,
      missingDelta: 0,
      movedDelta: 0,
      totalDelta: 0,
    });
  });

  it("only uses first two entries regardless of history length", () => {
    const history = [
      makeSnapshot({ healthy: 10, missing: 0, moved: 0, total: 10 }),
      makeSnapshot({ healthy: 5, missing: 3, moved: 2, total: 10 }),
      makeSnapshot({ healthy: 1, missing: 9, moved: 0, total: 10 }),
    ];
    const trend = computeTrend(history);
    expect(trend!.healthyDelta).toBe(5);
    expect(trend!.missingDelta).toBe(-3);
  });
});

describe("formatDelta", () => {
  it("formats positive deltas with +", () => {
    expect(formatDelta(3)).toBe("+3");
  });

  it("formats negative deltas with -", () => {
    expect(formatDelta(-2)).toBe("-2");
  });

  it("formats zero as 0", () => {
    expect(formatDelta(0)).toBe("0");
  });
});

describe("buildExportPayload with history", () => {
  it("includes history when provided", () => {
    const history = [makeSnapshot()];
    const payload = buildExportPayload(makeReport(), history);
    expect(payload.history).toEqual(history);
  });

  it("omits history key when empty", () => {
    const payload = buildExportPayload(makeReport(), []);
    expect(payload.history).toBeUndefined();
  });

  it("omits history key when undefined", () => {
    const payload = buildExportPayload(makeReport());
    expect(payload.history).toBeUndefined();
  });
});

// --- Export with priority/confidence/rationale ---

describe("export includes priority/confidence/rationale", () => {
  const healthCheck = {
    timestamp: "2026-03-12T12:00:00.000Z",
    tier: "warning" as const,
    metrics: { scansLast7d: 1, scansLast30d: 3, latestScanAgeMs: 86400000, streak: 1 },
    counts: { total: 5, healthy: 3, missing: 1, moved: 1 },
    recommendations: [
      {
        id: "relink-moved",
        priority: "high" as const,
        confidence: "high" as const,
        rationale: "1 document has move candidate; file-hash match confirms relocation.",
        title: "Relink 1 moved document",
        description: "Source files were found at new locations.",
        action: { type: "relink-all" as const },
      },
      {
        id: "remove-missing",
        priority: "medium" as const,
        confidence: "medium" as const,
        rationale: "1/5 entries missing (20%); no move candidates found.",
        title: "Remove 1 stale entry",
        description: "These source files are no longer found.",
      },
    ],
  };

  it("JSON export preserves confidence and rationale fields", () => {
    const payload = makePayload({ healthCheck });
    const parsed = JSON.parse(formatJSON(payload));
    const recs = parsed.healthCheck.recommendations;
    expect(recs[0].confidence).toBe("high");
    expect(recs[0].rationale).toContain("file-hash match");
    expect(recs[1].confidence).toBe("medium");
    expect(recs[1].rationale).toContain("20%");
  });

  it("markdown export includes confidence labels", () => {
    const payload = makePayload({ healthCheck });
    const md = formatMarkdown(payload);
    expect(md).toContain("(confidence: high)");
    expect(md).toContain("(confidence: med)");
  });

  it("markdown export includes estimated impact summary", () => {
    const payload = makePayload({ healthCheck });
    const md = formatMarkdown(payload);
    expect(md).toContain("**Estimated impact:** relink 1");
  });

  it("markdown export includes rationale lines", () => {
    const payload = makePayload({ healthCheck });
    const md = formatMarkdown(payload);
    expect(md).toContain("_Rationale:_ 1 document has move candidate");
    expect(md).toContain("_Rationale:_ 1/5 entries missing");
  });

  it("markdown export shows CRITICAL label", () => {
    const criticalHealthCheck = {
      ...healthCheck,
      recommendations: [
        {
          id: "never-scanned",
          priority: "critical" as const,
          confidence: "high" as const,
          rationale: "No scan history exists.",
          title: "Set up scanning",
          description: "No scans recorded.",
        },
      ],
    };
    const md = formatMarkdown(makePayload({ healthCheck: criticalHealthCheck }));
    expect(md).toContain("[CRITICAL]");
  });
});
