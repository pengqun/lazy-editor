import { beforeEach, describe, expect, it } from "vitest";
import {
  buildBatchImpactSummary,
  loadBatchImpactSummary,
  saveBatchImpactSummary,
  shouldShowBatchImpact,
} from "../../lib/integrity-batch-impact";
import type { BatchExecutionLog } from "../../lib/integrity-batch-plan";

function makeLog(): BatchExecutionLog {
  return {
    startedAt: "2026-03-13T08:00:00.000Z",
    completedAt: "2026-03-13T08:01:00.000Z",
    results: [
      {
        stepId: "step-a",
        recommendationId: "a",
        actionType: "relink-all",
        status: "success",
        outcome: "success",
        message: "ok",
        durationMs: 100,
        attempts: 1,
        affectedItems: 2,
      },
      {
        stepId: "step-b",
        recommendationId: "b",
        actionType: "remove-stale",
        status: "failed",
        outcome: "failed",
        message: "fail",
        durationMs: 100,
        attempts: 1,
        affectedItems: 1,
      },
      {
        stepId: "step-c",
        recommendationId: "c",
        actionType: "manual",
        status: "skipped",
        outcome: "skipped",
        message: "manual",
        durationMs: 0,
        attempts: 1,
        affectedItems: 0,
      },
    ],
    summary: {
      success: 1,
      failed: 1,
      skipped: 1,
      itemChanges: { success: 2, failed: 1, skipped: 0, total: 3 },
    },
  };
}

describe("integrity-batch-impact", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("builds compact summary from batch execution log", () => {
    const summary = buildBatchImpactSummary(makeLog());
    expect(summary.completedAt).toBe("2026-03-13T08:01:00.000Z");
    expect(summary.repairRate).toBeCloseTo(2 / 3);
    expect(summary.hitRate).toBeCloseTo(1 / 2);
    expect(summary.skipRate).toBeCloseTo(1 / 3);
    expect(summary.successSteps).toBe(1);
    expect(summary.failedSteps).toBe(1);
    expect(summary.skippedSteps).toBe(1);
  });

  it("persists and loads workspace-scoped summary", () => {
    const summary = buildBatchImpactSummary(makeLog());
    saveBatchImpactSummary("/tmp/ws-a", summary);

    expect(loadBatchImpactSummary("/tmp/ws-a")).toEqual(summary);
    expect(loadBatchImpactSummary("/tmp/ws-b")).toBeNull();
  });

  it("controls display condition by summary existence", () => {
    expect(shouldShowBatchImpact(null)).toBe(false);
    expect(shouldShowBatchImpact(buildBatchImpactSummary(makeLog()))).toBe(true);
  });
});
