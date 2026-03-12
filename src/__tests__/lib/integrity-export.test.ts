import {
  type IntegrityExportPayload,
  buildExportPayload,
  formatJSON,
  formatMarkdown,
} from "@/lib/integrity-export";
import type { IntegrityReport } from "@/stores/knowledge";
import { describe, expect, it } from "vitest";

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
});
