/**
 * Batch Fix Plan — composes a multi-step fix plan from prioritized health check
 * recommendations, previews before execution, and runs supported actions in sequence.
 *
 * Safety rules:
 * - Only non-destructive / repair-safe actions are auto-executed.
 * - High-risk or unsupported steps are marked "manual-only" and skipped.
 * - Explicit confirm gate required before any mutation.
 * - One-by-one actions remain available alongside batch plans.
 */

import type { HealthCheckRecommendation, HealthCheckReport, RecommendationAction } from "./integrity-healthcheck";

// --- Types ---

export type BatchStepKind = "auto" | "manual-only";
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type StepOutcome = "success" | "failed" | "skipped";

export interface BatchPlanStep {
  /** Unique step id (derived from recommendation id). */
  stepId: string;
  /** Index in execution order (0-based). */
  order: number;
  /** Source recommendation. */
  recommendation: HealthCheckRecommendation;
  /** Whether this step can be auto-executed or requires manual intervention. */
  kind: BatchStepKind;
  /** Why this step is included / what it does. */
  rationale: string;
  /** Estimated impact description. */
  impact: string;
  /** If manual-only, why it can't be auto-executed. */
  manualReason?: string;
}

export interface BatchFixPlan {
  /** ISO timestamp of plan creation. */
  createdAt: string;
  /** Steps in execution order. */
  steps: BatchPlanStep[];
  /** Count of auto-executable steps. */
  autoCount: number;
  /** Count of manual-only steps (will be skipped). */
  manualCount: number;
}

export interface StepExecutionResult {
  stepId: string;
  recommendationId: string;
  actionType: RecommendationAction["type"] | "manual" | "none";
  status: StepStatus;
  outcome: StepOutcome;
  message: string;
  durationMs: number;
  attempts: number;
  affectedItems: number;
}

export interface BatchExecutionLog {
  /** ISO timestamp of execution start. */
  startedAt: string;
  /** ISO timestamp of execution end. */
  completedAt: string;
  /** Per-step results in execution order. */
  results: StepExecutionResult[];
  /** Summary counts. */
  summary: {
    success: number;
    failed: number;
    skipped: number;
    itemChanges: { success: number; failed: number; skipped: number; total: number };
  };
}

export interface BatchExecutionMetrics {
  repairRate: number;
  hitRate: number;
  skipRate: number;
  successSteps: number;
  executableSteps: number;
  skippedSteps: number;
  totalSteps: number;
  successImpactItems: number;
  estimatedImpactItems: number;
}

// --- Action classification ---

/** Actions that are safe for auto-execution (non-destructive / repair-safe). */
const AUTO_SAFE_ACTIONS: RecommendationAction["type"][] = [
  "relink-all",
  "remove-stale",
  "enable-reminders",
  "adjust-frequency",
];

export function classifyStep(rec: HealthCheckRecommendation): BatchStepKind {
  if (!rec.action) return "manual-only";
  if (!AUTO_SAFE_ACTIONS.includes(rec.action.type)) return "manual-only";

  // remove-stale with medium confidence → manual (files could reappear)
  if (rec.action.type === "remove-stale" && rec.confidence !== "high") {
    return "manual-only";
  }

  return "auto";
}

function manualReason(rec: HealthCheckRecommendation): string | undefined {
  if (!rec.action) return "Informational — no automated action available.";
  if (rec.action.type === "remove-stale" && rec.confidence !== "high") {
    return "Confidence is not high — files may reappear. Review manually before removing.";
  }
  return undefined;
}

// --- Impact estimation ---

function estimateImpact(rec: HealthCheckRecommendation): string {
  if (!rec.action) return "No changes — review recommended.";
  switch (rec.action.type) {
    case "relink-all":
      return "Relinks moved documents to verified new locations.";
    case "remove-stale":
      return `Removes ${rec.action.ids.length} stale KB entr${rec.action.ids.length === 1 ? "y" : "ies"} with no source file.`;
    case "enable-reminders":
      return "Enables periodic scan reminders (easily reversible in settings).";
    case "adjust-frequency":
      return `Changes scan frequency to "${rec.action.suggested}" for better coverage.`;
    default:
      return "No changes.";
  }
}

function actionTypeForStep(step: BatchPlanStep): RecommendationAction["type"] | "manual" | "none" {
  if (step.kind === "manual-only") return "manual";
  return step.recommendation.action?.type ?? "none";
}

function estimateAffectedItems(step: BatchPlanStep, movedEntries: Array<{ id: number; movedCandidate: string | null }>): number {
  const action = step.recommendation.action;
  if (!action) return 0;
  switch (action.type) {
    case "relink-all":
      return movedEntries.filter((e) => Boolean(e.movedCandidate)).length;
    case "remove-stale":
      return action.ids.length;
    case "enable-reminders":
    case "adjust-frequency":
      return 1;
    default:
      return 0;
  }
}

export interface BatchImpactSummary {
  relink: number;
  remove: number;
  reminders: number;
  frequency: number;
}

export function summarizeEstimatedImpact(plan: BatchFixPlan, movedCount = 0): BatchImpactSummary {
  const hasRelink = plan.steps.some((s) => s.recommendation.action?.type === "relink-all");
  const remove = plan.steps.reduce((sum, step) => {
    const action = step.recommendation.action;
    return action?.type === "remove-stale" ? sum + action.ids.length : sum;
  }, 0);

  return {
    relink: hasRelink ? movedCount : 0,
    remove,
    reminders: plan.steps.some((s) => s.recommendation.action?.type === "enable-reminders") ? 1 : 0,
    frequency: plan.steps.some((s) => s.recommendation.action?.type === "adjust-frequency") ? 1 : 0,
  };
}

export function formatEstimatedImpact(summary: BatchImpactSummary): string {
  const parts: string[] = [];
  if (summary.relink > 0) parts.push(`relink ${summary.relink}`);
  if (summary.remove > 0) parts.push(`remove ${summary.remove}`);
  if (summary.reminders > 0) parts.push(`reminders ${summary.reminders}`);
  if (summary.frequency > 0) parts.push(`frequency ${summary.frequency}`);
  return parts.length > 0 ? parts.join(" · ") : "none";
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function computeBatchExecutionMetrics(log: BatchExecutionLog): BatchExecutionMetrics {
  const totalSteps = log.results.length;
  const skippedSteps = log.summary.skipped;
  const executableSteps = totalSteps - skippedSteps;
  const successSteps = log.summary.success;
  const successImpactItems = log.summary.itemChanges.success;
  const estimatedImpactItems = log.summary.itemChanges.total;

  return {
    repairRate: ratio(successImpactItems, estimatedImpactItems),
    hitRate: ratio(successSteps, executableSteps),
    skipRate: ratio(skippedSteps, totalSteps),
    successSteps,
    executableSteps,
    skippedSteps,
    totalSteps,
    successImpactItems,
    estimatedImpactItems,
  };
}

export function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function buildBatchExecutionSummaryText(log: BatchExecutionLog): string {
  const metrics = computeBatchExecutionMetrics(log);
  const failedSteps = log.results.filter((r) => r.outcome === "failed");
  const failureSection = failedSteps.length
    ? failedSteps
        .slice(0, 5)
        .map((r) => `- ${r.stepId.replace("step-", "")}: ${r.message}`)
        .join("\n")
    : "- 无";

  return [
    "批处理执行摘要",
    `时间: ${log.completedAt}`,
    `修复率: ${formatRate(metrics.repairRate)} (${metrics.successImpactItems}/${metrics.estimatedImpactItems})`,
    `命中率: ${formatRate(metrics.hitRate)} (${metrics.successSteps}/${metrics.executableSteps})`,
    `跳过率: ${formatRate(metrics.skipRate)} (${metrics.skippedSteps}/${metrics.totalSteps})`,
    `结果: 成功 ${log.summary.success} · 失败 ${log.summary.failed} · 跳过 ${log.summary.skipped}`,
    "主要失败步骤:",
    failureSection,
  ].join("\n");
}

export type BatchFailureCategory = "manual-only" | "unsupported" | "invoke-error" | "skipped-other" | "unknown";

export interface BatchFailureAdvice {
  category: BatchFailureCategory;
  title: string;
  reason: string;
  actions: string[];
  stepIds: string[];
}

export function classifyBatchFailure(result: StepExecutionResult): BatchFailureCategory {
  const message = result.message.toLowerCase();
  if (result.outcome === "skipped" && result.actionType === "manual") return "manual-only";
  if (result.outcome === "skipped") return "skipped-other";
  if (message.includes("unsupported action")) return "unsupported";
  if (result.outcome === "failed") return "invoke-error";
  return "unknown";
}

const BATCH_FAILURE_ADVICE_TEMPLATE: Record<BatchFailureCategory, Omit<BatchFailureAdvice, "stepIds">> = {
  "manual-only": {
    category: "manual-only",
    title: "需要手动处理（manual-only）",
    reason: "该步骤被安全策略标记为需人工确认，批处理会跳过。",
    actions: ["单步处理（人工确认后执行）", "重新扫描以刷新状态", "导出摘要给协作方"],
  },
  unsupported: {
    category: "unsupported",
    title: "动作暂不支持（unsupported）",
    reason: "当前执行器不支持该动作类型或参数。",
    actions: ["导出摘要并提交问题", "改用单步处理", "重新扫描确认是否仍需该动作"],
  },
  "invoke-error": {
    category: "invoke-error",
    title: "执行调用失败（invoke error）",
    reason: "执行步骤时出现运行时错误（权限、IO、状态变化等）。",
    actions: ["重试失败步骤", "切换到单步处理定位问题", "重新扫描后再执行"],
  },
  "skipped-other": {
    category: "skipped-other",
    title: "步骤被跳过（skipped）",
    reason: "步骤未执行，通常是前置条件不满足或计划已变化。",
    actions: ["重新生成批处理计划", "单步处理后再批量", "导出摘要以便复盘"],
  },
  unknown: {
    category: "unknown",
    title: "未知失败类型",
    reason: "无法自动归类，请查看步骤详情。",
    actions: ["重试失败步骤", "单步处理排查", "导出摘要并附日志"],
  },
};

export function buildBatchFailureAdvices(log: BatchExecutionLog): BatchFailureAdvice[] {
  const grouped = new Map<BatchFailureCategory, StepExecutionResult[]>();
  for (const result of log.results) {
    if (result.outcome !== "failed" && result.outcome !== "skipped") continue;
    const category = classifyBatchFailure(result);
    const bucket = grouped.get(category) ?? [];
    bucket.push(result);
    grouped.set(category, bucket);
  }

  return Array.from(grouped.entries()).map(([category, items]) => {
    const template = BATCH_FAILURE_ADVICE_TEMPLATE[category] ?? BATCH_FAILURE_ADVICE_TEMPLATE.unknown;
    return {
      ...template,
      stepIds: items.map((i) => i.stepId),
    };
  });
}

// --- Ordering ---

const ACTION_ORDER: Record<string, number> = {
  "relink-all": 0,
  "remove-stale": 1,
  "enable-reminders": 2,
  "adjust-frequency": 3,
};

export function executionOrder(rec: HealthCheckRecommendation): number {
  if (!rec.action) return 99;
  return ACTION_ORDER[rec.action.type] ?? 50;
}

// --- Plan generation ---

export function buildBatchFixPlan(
  report: HealthCheckReport,
  now: Date = new Date(),
): BatchFixPlan {
  const actionable = report.recommendations.filter((r) => r.id !== "all-clear");
  const sorted = [...actionable].sort((a, b) => executionOrder(a) - executionOrder(b));

  const steps: BatchPlanStep[] = sorted.map((rec, idx) => {
    const kind = classifyStep(rec);
    return {
      stepId: `step-${rec.id}`,
      order: idx,
      recommendation: rec,
      kind,
      rationale: rec.rationale,
      impact: estimateImpact(rec),
      manualReason: kind === "manual-only" ? manualReason(rec) : undefined,
    };
  });

  return {
    createdAt: now.toISOString(),
    steps,
    autoCount: steps.filter((s) => s.kind === "auto").length,
    manualCount: steps.filter((s) => s.kind === "manual-only").length,
  };
}

// --- Execution ---

export interface BatchExecutionCallbacks {
  relinkDocument: (id: number, newPath: string) => Promise<void>;
  removeStaleDocuments: (ids: number[]) => Promise<void>;
  enableReminders: () => void;
  adjustFrequency: (freq: string) => void;
  movedEntries: Array<{ id: number; movedCandidate: string | null }>;
}

export interface BatchExecutionOptions {
  onStepStatusChange?: (stepId: string, status: StepStatus) => void;
}

function summarize(results: StepExecutionResult[]) {
  const success = results.filter((r) => r.outcome === "success");
  const failed = results.filter((r) => r.outcome === "failed");
  const skipped = results.filter((r) => r.outcome === "skipped");
  return {
    success: success.length,
    failed: failed.length,
    skipped: skipped.length,
    itemChanges: {
      success: success.reduce((sum, r) => sum + r.affectedItems, 0),
      failed: failed.reduce((sum, r) => sum + r.affectedItems, 0),
      skipped: skipped.reduce((sum, r) => sum + r.affectedItems, 0),
      total: results.reduce((sum, r) => sum + r.affectedItems, 0),
    },
  };
}

export async function executeBatchStep(
  step: BatchPlanStep,
  callbacks: BatchExecutionCallbacks,
  options?: BatchExecutionOptions,
  attempts = 1,
): Promise<StepExecutionResult> {
  if (step.kind === "manual-only") {
    options?.onStepStatusChange?.(step.stepId, "skipped");
    return {
      stepId: step.stepId,
      recommendationId: step.recommendation.id,
      actionType: actionTypeForStep(step),
      status: "skipped",
      outcome: "skipped",
      message: step.manualReason ?? "Manual intervention required.",
      durationMs: 0,
      attempts,
      affectedItems: estimateAffectedItems(step, callbacks.movedEntries),
    };
  }

  options?.onStepStatusChange?.(step.stepId, "running");
  const t0 = performance.now();
  try {
    await executeStep(step, callbacks);
    options?.onStepStatusChange?.(step.stepId, "success");
    return {
      stepId: step.stepId,
      recommendationId: step.recommendation.id,
      actionType: actionTypeForStep(step),
      status: "success",
      outcome: "success",
      message: step.impact,
      durationMs: Math.round(performance.now() - t0),
      attempts,
      affectedItems: estimateAffectedItems(step, callbacks.movedEntries),
    };
  } catch (err) {
    options?.onStepStatusChange?.(step.stepId, "failed");
    return {
      stepId: step.stepId,
      recommendationId: step.recommendation.id,
      actionType: actionTypeForStep(step),
      status: "failed",
      outcome: "failed",
      message: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - t0),
      attempts,
      affectedItems: estimateAffectedItems(step, callbacks.movedEntries),
    };
  }
}

export async function executeBatchFixPlan(
  plan: BatchFixPlan,
  callbacks: BatchExecutionCallbacks,
  options?: BatchExecutionOptions,
): Promise<BatchExecutionLog> {
  const startedAt = new Date().toISOString();
  const results: StepExecutionResult[] = [];

  for (const step of plan.steps) {
    options?.onStepStatusChange?.(step.stepId, "pending");
  }

  for (const step of plan.steps) {
    const result = await executeBatchStep(step, callbacks, options, 1);
    results.push(result);
  }

  const completedAt = new Date().toISOString();
  return {
    startedAt,
    completedAt,
    results,
    summary: summarize(results),
  };
}

export function mergeRetriedResult(
  log: BatchExecutionLog,
  retried: StepExecutionResult,
): BatchExecutionLog {
  const results = log.results.map((r) =>
    r.stepId === retried.stepId
      ? {
          ...retried,
          attempts: r.attempts + 1,
        }
      : r,
  );
  return {
    ...log,
    completedAt: new Date().toISOString(),
    results,
    summary: summarize(results),
  };
}

async function executeStep(
  step: BatchPlanStep,
  callbacks: BatchExecutionCallbacks,
): Promise<void> {
  const action = step.recommendation.action;
  if (!action) throw new Error("No action to execute");

  switch (action.type) {
    case "relink-all": {
      for (const entry of callbacks.movedEntries) {
        if (entry.movedCandidate) {
          await callbacks.relinkDocument(entry.id, entry.movedCandidate);
        }
      }
      break;
    }
    case "remove-stale":
      await callbacks.removeStaleDocuments(action.ids);
      break;
    case "enable-reminders":
      callbacks.enableReminders();
      break;
    case "adjust-frequency":
      callbacks.adjustFrequency(action.suggested);
      break;
    default:
      throw new Error(`Unsupported action type: ${(action as RecommendationAction).type}`);
  }
}
