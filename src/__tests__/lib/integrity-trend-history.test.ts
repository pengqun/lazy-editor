import { describe, expect, it, beforeEach } from "vitest";
import type { IntegrityScanSnapshot } from "@/stores/knowledge";
import { loadIntegrityTrendHistory, syncIntegrityTrendHistory, toSparkline } from "@/lib/integrity-trend-history";

function snap(overrides: Partial<IntegrityScanSnapshot>): IntegrityScanSnapshot {
  return {
    id: 1,
    scannedAt: "2026-03-13T08:00:00",
    total: 10,
    healthy: 8,
    missing: 1,
    moved: 1,
    notes: null,
    ...overrides,
  };
}

describe("integrity-trend-history", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("merges and persists trend points with dedupe", () => {
    const workspace = "/tmp/ws-a";
    syncIntegrityTrendHistory(workspace, [snap({ id: 1, scannedAt: "2026-03-13T08:00:00", missing: 2 })]);
    const merged = syncIntegrityTrendHistory(workspace, [
      snap({ id: 2, scannedAt: "2026-03-13T09:00:00", missing: 1, moved: 2 }),
      snap({ id: 3, scannedAt: "2026-03-13T08:00:00", missing: 3, moved: 0 }),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0].scannedAt).toBe("2026-03-13T09:00:00");
    expect(merged[1].missing).toBe(3);

    const reloaded = loadIntegrityTrendHistory(workspace);
    expect(reloaded).toEqual(merged);
  });

  it("defaults invalid to 0 and keeps explicit invalid value", () => {
    const merged = syncIntegrityTrendHistory("/tmp/ws-b", [
      snap({ id: 1, scannedAt: "2026-03-13T08:00:00" }),
      { ...snap({ id: 2, scannedAt: "2026-03-13T09:00:00" }), invalid: 4 },
    ]);

    expect(merged[0].invalid).toBe(4);
    expect(merged[1].invalid).toBe(0);
  });

  it("builds sparkline from values", () => {
    expect(toSparkline([0, 1, 2, 3])).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
    expect(toSparkline([])).toBe("-");
  });
});
