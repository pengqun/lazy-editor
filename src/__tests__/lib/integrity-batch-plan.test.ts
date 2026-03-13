import { describe, expect, it, vi } from "vitest";
import {
  type BatchExecutionCallbacks,
  type BatchFixPlan,
  buildBatchExecutionSummaryText,
  buildBatchFailureAdvices,
  buildBatchFixPlan,
  classifyBatchFailure,
  classifyStep,
  computeBatchExecutionMetrics,
  executeBatchFixPlan,
  executeBatchStep,
  executionOrder,
  formatEstimatedImpact,
  formatRate,
  mergeRetriedResult,
  summarizeEstimatedImpact,
} from "../../lib/integrity-batch-plan";
import type { HealthCheckRecommendation, HealthCheckReport } from "../../lib/integrity-healthcheck";

// --- Helpers ---

function makeRec(overrides: Partial<HealthCheckRecommendation>): HealthCheckRecommendation {
  return {
    id: "test",
    priority: "medium",
    confidence: "high",
    rationale: "test rationale",
    title: "Test",
    description: "test desc",
    ...overrides,
  };
}

function makeReport(recs: HealthCheckRecommendation[]): HealthCheckReport {
  return {
    timestamp: "2026-03-13T10:00:00.000Z",
    tier: "warning",
    metrics: { scansLast7d: 2, scansLast30d: 5, latestScanAgeMs: 3600000, streak: 1 },
    counts: { total: 10, healthy: 6, missing: 2, moved: 2 },
    recommendations: recs,
  };
}

function makeCallbacks(overrides?: Partial<BatchExecutionCallbacks>): BatchExecutionCallbacks {
  return {
    relinkDocument: vi.fn().mockResolvedValue(undefined),
    removeStaleDocuments: vi.fn().mockResolvedValue(undefined),
    enableReminders: vi.fn(),
    adjustFrequency: vi.fn(),
    movedEntries: [
      { id: 1, movedCandidate: "/new/path1" },
      { id: 2, movedCandidate: "/new/path2" },
    ],
    ...overrides,
  };
}

// --- classifyStep ---

describe("classifyStep", () => {
  it("classifies relink-all as auto", () => {
    const rec = makeRec({ action: { type: "relink-all" }, confidence: "high" });
    expect(classifyStep(rec)).toBe("auto");
  });

  it("classifies remove-stale with high confidence as auto", () => {
    const rec = makeRec({
      action: { type: "remove-stale", ids: [1, 2] },
      confidence: "high",
    });
    expect(classifyStep(rec)).toBe("auto");
  });

  it("classifies remove-stale with medium confidence as manual-only", () => {
    const rec = makeRec({
      action: { type: "remove-stale", ids: [1] },
      confidence: "medium",
    });
    expect(classifyStep(rec)).toBe("manual-only");
  });

  it("classifies remove-stale with low confidence as manual-only", () => {
    const rec = makeRec({
      action: { type: "remove-stale", ids: [1] },
      confidence: "low",
    });
    expect(classifyStep(rec)).toBe("manual-only");
  });

  it("classifies enable-reminders as auto", () => {
    const rec = makeRec({ action: { type: "enable-reminders" } });
    expect(classifyStep(rec)).toBe("auto");
  });

  it("classifies adjust-frequency as auto", () => {
    const rec = makeRec({ action: { type: "adjust-frequency", suggested: "daily" } });
    expect(classifyStep(rec)).toBe("auto");
  });

  it("classifies recommendations without action as manual-only", () => {
    const rec = makeRec({ id: "low-health-ratio" });
    expect(classifyStep(rec)).toBe("manual-only");
  });
});

// --- executionOrder ---

describe("executionOrder", () => {
  it("orders relink-all first", () => {
    const rec = makeRec({ action: { type: "relink-all" } });
    expect(executionOrder(rec)).toBe(0);
  });

  it("orders remove-stale after relink-all", () => {
    const relink = makeRec({ action: { type: "relink-all" } });
    const remove = makeRec({ action: { type: "remove-stale", ids: [1] } });
    expect(executionOrder(relink)).toBeLessThan(executionOrder(remove));
  });

  it("orders settings actions after data actions", () => {
    const remove = makeRec({ action: { type: "remove-stale", ids: [1] } });
    const enable = makeRec({ action: { type: "enable-reminders" } });
    const adjust = makeRec({ action: { type: "adjust-frequency", suggested: "daily" } });
    expect(executionOrder(remove)).toBeLessThan(executionOrder(enable));
    expect(executionOrder(enable)).toBeLessThan(executionOrder(adjust));
  });

  it("puts informational (no action) last", () => {
    const noAction = makeRec({});
    const withAction = makeRec({ action: { type: "enable-reminders" } });
    expect(executionOrder(noAction)).toBeGreaterThan(executionOrder(withAction));
  });
});

// --- buildBatchFixPlan ---

describe("buildBatchFixPlan", () => {
  const now = new Date("2026-03-13T12:00:00Z");

  it("builds a plan from recommendations", () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" }, priority: "high", confidence: "high" }),
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [3, 4] }, priority: "critical", confidence: "high" }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs), now);

    expect(plan.steps).toHaveLength(2);
    expect(plan.createdAt).toBe("2026-03-13T12:00:00.000Z");
    expect(plan.autoCount).toBe(2);
    expect(plan.manualCount).toBe(0);
  });

  it("filters out all-clear recommendations", () => {
    const recs = [
      makeRec({ id: "all-clear", priority: "info", confidence: "high" }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs), now);
    expect(plan.steps).toHaveLength(0);
  });

  it("orders steps by execution priority (relink before remove)", () => {
    const recs = [
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [1] }, confidence: "high" }),
      makeRec({ id: "relink-moved", action: { type: "relink-all" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs), now);

    expect(plan.steps[0].recommendation.id).toBe("relink-moved");
    expect(plan.steps[1].recommendation.id).toBe("remove-missing");
  });

  it("marks manual-only steps correctly", () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" }, confidence: "high" }),
      makeRec({ id: "low-health-ratio", priority: "critical", confidence: "high" }),
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [1] }, confidence: "medium" }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs), now);

    const relinkStep = plan.steps.find((s) => s.recommendation.id === "relink-moved")!;
    const ratioStep = plan.steps.find((s) => s.recommendation.id === "low-health-ratio")!;
    const removeStep = plan.steps.find((s) => s.recommendation.id === "remove-missing")!;

    expect(relinkStep.kind).toBe("auto");
    expect(ratioStep.kind).toBe("manual-only");
    expect(ratioStep.manualReason).toBeDefined();
    expect(removeStep.kind).toBe("manual-only");
    expect(removeStep.manualReason).toContain("Confidence");
  });

  it("counts auto and manual steps correctly", () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" } }),
      makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } }),
      makeRec({ id: "low-health-ratio" }), // no action → manual
    ];
    const plan = buildBatchFixPlan(makeReport(recs), now);
    expect(plan.autoCount).toBe(2);
    expect(plan.manualCount).toBe(1);
  });

  it("assigns sequential order indices", () => {
    const recs = [
      makeRec({ id: "a", action: { type: "relink-all" } }),
      makeRec({ id: "b", action: { type: "remove-stale", ids: [1] }, confidence: "high" }),
      makeRec({ id: "c", action: { type: "enable-reminders" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs), now);
    expect(plan.steps.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("includes impact description for every step", () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" } }),
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [1, 2, 3] }, confidence: "high" }),
      makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } }),
      makeRec({ id: "adjust-frequency", action: { type: "adjust-frequency", suggested: "daily" } }),
      makeRec({ id: "low-health-ratio" }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs), now);
    for (const step of plan.steps) {
      expect(step.impact).toBeTruthy();
      expect(step.impact.length).toBeGreaterThan(0);
    }
  });
});

describe("estimated impact summary", () => {
  it("summarizes relink/remove/reminders/frequency counts", () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" } }),
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [10, 11] }, confidence: "high" }),
      makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } }),
      makeRec({ id: "adjust-frequency", action: { type: "adjust-frequency", suggested: "daily" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs));

    const summary = summarizeEstimatedImpact(plan, 3);

    expect(summary).toEqual({ relink: 3, remove: 2, reminders: 1, frequency: 1 });
    expect(formatEstimatedImpact(summary)).toBe("relink 3 · remove 2 · reminders 1 · frequency 1");
  });

  it("formats empty summary as none", () => {
    const summary = formatEstimatedImpact({ relink: 0, remove: 0, reminders: 0, frequency: 0 });
    expect(summary).toBe("none");
  });
});

// --- executeBatchFixPlan (confirm gate + execution) ---

describe("executeBatchFixPlan", () => {
  it("executes auto steps and skips manual-only steps", async () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" }, confidence: "high" }),
      makeRec({ id: "low-health-ratio" }), // manual-only
    ];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();

    const log = await executeBatchFixPlan(plan, callbacks);

    expect(log.results).toHaveLength(2);
    expect(log.results[0].outcome).toBe("success");
    expect(log.results[1].outcome).toBe("skipped");
    expect(log.summary.success).toBe(1);
    expect(log.summary.skipped).toBe(1);
    expect(log.summary.failed).toBe(0);
  });

  it("calls relinkDocument for each moved entry on relink-all", async () => {
    const recs = [makeRec({ id: "relink-moved", action: { type: "relink-all" } })];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();

    await executeBatchFixPlan(plan, callbacks);

    expect(callbacks.relinkDocument).toHaveBeenCalledTimes(2);
    expect(callbacks.relinkDocument).toHaveBeenCalledWith(1, "/new/path1");
    expect(callbacks.relinkDocument).toHaveBeenCalledWith(2, "/new/path2");
  });

  it("calls removeStaleDocuments with correct ids", async () => {
    const recs = [
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [10, 20] }, confidence: "high" }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();

    await executeBatchFixPlan(plan, callbacks);

    expect(callbacks.removeStaleDocuments).toHaveBeenCalledWith([10, 20]);
  });

  it("calls enableReminders for enable-reminders action", async () => {
    const recs = [makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } })];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();

    await executeBatchFixPlan(plan, callbacks);

    expect(callbacks.enableReminders).toHaveBeenCalledTimes(1);
  });

  it("calls adjustFrequency for adjust-frequency action", async () => {
    const recs = [
      makeRec({ id: "adjust-frequency", action: { type: "adjust-frequency", suggested: "daily" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();

    await executeBatchFixPlan(plan, callbacks);

    expect(callbacks.adjustFrequency).toHaveBeenCalledWith("daily");
  });

  it("records failure when a step throws", async () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" } }),
      makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks({
      relinkDocument: vi.fn().mockRejectedValue(new Error("DB error")),
    });

    const log = await executeBatchFixPlan(plan, callbacks);

    expect(log.results[0].outcome).toBe("failed");
    expect(log.results[0].message).toBe("DB error");
    // Second step still executes
    expect(log.results[1].outcome).toBe("success");
    expect(log.summary.failed).toBe(1);
    expect(log.summary.success).toBe(1);
  });

  it("records timing for each step", async () => {
    const recs = [makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } })];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();

    const log = await executeBatchFixPlan(plan, callbacks);

    expect(log.results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("has valid timestamps in the log", async () => {
    const recs = [makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } })];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();

    const log = await executeBatchFixPlan(plan, callbacks);

    expect(log.startedAt).toBeTruthy();
    expect(log.completedAt).toBeTruthy();
    expect(new Date(log.startedAt).getTime()).toBeLessThanOrEqual(new Date(log.completedAt).getTime());
  });

  it("handles empty plan gracefully", async () => {
    const plan: BatchFixPlan = {
      createdAt: new Date().toISOString(),
      steps: [],
      autoCount: 0,
      manualCount: 0,
    };
    const callbacks = makeCallbacks();

    const log = await executeBatchFixPlan(plan, callbacks);

    expect(log.results).toHaveLength(0);
    expect(log.summary.success).toBe(0);
    expect(log.summary.failed).toBe(0);
    expect(log.summary.skipped).toBe(0);
    expect(log.summary.itemChanges.total).toBe(0);
  });

  it("skips moved entries without candidates during relink-all", async () => {
    const recs = [makeRec({ id: "relink-moved", action: { type: "relink-all" } })];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks({
      movedEntries: [
        { id: 1, movedCandidate: "/new/path" },
        { id: 2, movedCandidate: null },
      ],
    });

    await executeBatchFixPlan(plan, callbacks);

    expect(callbacks.relinkDocument).toHaveBeenCalledTimes(1);
    expect(callbacks.relinkDocument).toHaveBeenCalledWith(1, "/new/path");
  });
});

// --- Result aggregation ---

describe("result aggregation", () => {
  it("correctly aggregates mixed outcomes", async () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" } }),
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [1] }, confidence: "high" }),
      makeRec({ id: "low-health-ratio" }), // manual
      makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks({
      removeStaleDocuments: vi.fn().mockRejectedValue(new Error("fail")),
    });

    const log = await executeBatchFixPlan(plan, callbacks);

    // relink → success, remove → fail, health-ratio → skipped, enable → success
    expect(log.summary.success).toBe(2);
    expect(log.summary.failed).toBe(1);
    expect(log.summary.skipped).toBe(1);
    expect(log.summary.itemChanges.success).toBe(3);
    expect(log.summary.itemChanges.failed).toBe(1);
    expect(log.summary.itemChanges.skipped).toBe(0);
    expect(log.results).toHaveLength(4);
  });

  it("reports pending/running/success status transitions", async () => {
    const recs = [makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } })];
    const plan = buildBatchFixPlan(makeReport(recs));
    const callbacks = makeCallbacks();
    const statusTrail: string[] = [];

    await executeBatchFixPlan(plan, callbacks, {
      onStepStatusChange: (_id, status) => statusTrail.push(status),
    });

    expect(statusTrail).toEqual(["pending", "running", "success"]);
  });

  it("supports merging retried failed step result", async () => {
    const recs = [makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [1, 2] }, confidence: "high" })];
    const plan = buildBatchFixPlan(makeReport(recs));
    const failedLog = await executeBatchFixPlan(plan, makeCallbacks({
      removeStaleDocuments: vi.fn().mockRejectedValue(new Error("first fail")),
    }));

    const retryResult = await executeBatchStep(plan.steps[0], makeCallbacks(), undefined, 2);
    const merged = mergeRetriedResult(failedLog, retryResult);

    expect(merged.results[0].outcome).toBe("success");
    expect(merged.results[0].attempts).toBe(2);
    expect(merged.summary.failed).toBe(0);
    expect(merged.summary.success).toBe(1);
  });
});

describe("failure classification and advice", () => {
  it("classifies manual-only skip, unsupported and invoke errors", () => {
    expect(classifyBatchFailure({
      stepId: "step-a",
      recommendationId: "a",
      actionType: "manual",
      status: "skipped",
      outcome: "skipped",
      message: "Manual intervention required.",
      durationMs: 0,
      attempts: 1,
      affectedItems: 0,
    })).toBe("manual-only");

    expect(classifyBatchFailure({
      stepId: "step-b",
      recommendationId: "b",
      actionType: "relink-all",
      status: "failed",
      outcome: "failed",
      message: "Unsupported action type: foo",
      durationMs: 3,
      attempts: 1,
      affectedItems: 1,
    })).toBe("unsupported");

    expect(classifyBatchFailure({
      stepId: "step-c",
      recommendationId: "c",
      actionType: "remove-stale",
      status: "failed",
      outcome: "failed",
      message: "permission denied",
      durationMs: 8,
      attempts: 1,
      affectedItems: 2,
    })).toBe("invoke-error");
  });

  it("builds grouped failure advice from failed/skipped results", () => {
    const advices = buildBatchFailureAdvices({
      startedAt: "2026-03-13T10:00:00.000Z",
      completedAt: "2026-03-13T10:00:01.000Z",
      summary: {
        success: 1,
        failed: 2,
        skipped: 1,
        itemChanges: { success: 1, failed: 2, skipped: 0, total: 3 },
      },
      results: [
        {
          stepId: "step-manual",
          recommendationId: "manual",
          actionType: "manual",
          status: "skipped",
          outcome: "skipped",
          message: "Manual intervention required.",
          durationMs: 0,
          attempts: 1,
          affectedItems: 0,
        },
        {
          stepId: "step-unsupported",
          recommendationId: "unsupported",
          actionType: "remove-stale",
          status: "failed",
          outcome: "failed",
          message: "Unsupported action type: archive",
          durationMs: 5,
          attempts: 1,
          affectedItems: 1,
        },
        {
          stepId: "step-invoke",
          recommendationId: "invoke",
          actionType: "relink-all",
          status: "failed",
          outcome: "failed",
          message: "tauri invoke failed",
          durationMs: 12,
          attempts: 1,
          affectedItems: 1,
        },
        {
          stepId: "step-ok",
          recommendationId: "ok",
          actionType: "enable-reminders",
          status: "success",
          outcome: "success",
          message: "done",
          durationMs: 1,
          attempts: 1,
          affectedItems: 1,
        },
      ],
    });

    expect(advices.map((a) => a.category)).toEqual(["manual-only", "unsupported", "invoke-error"]);
    expect(advices[0].actions.join(" ")).toContain("单步处理");
    expect(advices[1].actions.join(" ")).toContain("导出摘要");
    expect(advices[2].actions.join(" ")).toContain("重试失败步骤");
  });
});

describe("execution metrics and summary text", () => {
  it("computes repair/hit/skip rates from execution log", async () => {
    const recs = [
      makeRec({ id: "relink-moved", action: { type: "relink-all" } }),
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [1] }, confidence: "high" }),
      makeRec({ id: "low-health-ratio" }),
      makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs));
    const log = await executeBatchFixPlan(plan, makeCallbacks({
      removeStaleDocuments: vi.fn().mockRejectedValue(new Error("remove failed")),
    }));

    const metrics = computeBatchExecutionMetrics(log);

    expect(metrics.successImpactItems).toBe(3);
    expect(metrics.estimatedImpactItems).toBe(4);
    expect(metrics.successSteps).toBe(2);
    expect(metrics.executableSteps).toBe(3);
    expect(metrics.skippedSteps).toBe(1);
    expect(metrics.totalSteps).toBe(4);
    expect(formatRate(metrics.repairRate)).toBe("75.0%");
    expect(formatRate(metrics.hitRate)).toBe("66.7%");
    expect(formatRate(metrics.skipRate)).toBe("25.0%");
  });

  it("builds copyable execution summary text with failed steps", async () => {
    const recs = [
      makeRec({ id: "remove-missing", action: { type: "remove-stale", ids: [3, 4] }, confidence: "high" }),
      makeRec({ id: "enable-reminders", action: { type: "enable-reminders" } }),
    ];
    const plan = buildBatchFixPlan(makeReport(recs));
    const log = await executeBatchFixPlan(plan, makeCallbacks({
      removeStaleDocuments: vi.fn().mockRejectedValue(new Error("permission denied")),
    }));

    const summary = buildBatchExecutionSummaryText(log);

    expect(summary).toContain("批处理执行摘要");
    expect(summary).toContain("时间:");
    expect(summary).toContain("修复率:");
    expect(summary).toContain("命中率:");
    expect(summary).toContain("跳过率:");
    expect(summary).toContain("结果: 成功 1 · 失败 1 · 跳过 0");
    expect(summary).toContain("remove-missing: permission denied");
  });
});
