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

export type StepOutcome = "success" | "failed" | "skipped";

export interface StepExecutionResult {
  stepId: string;
  outcome: StepOutcome;
  message: string;
  durationMs: number;
}

export interface BatchExecutionLog {
  /** ISO timestamp of execution start. */
  startedAt: string;
  /** ISO timestamp of execution end. */
  completedAt: string;
  /** Per-step results in execution order. */
  results: StepExecutionResult[];
  /** Summary counts. */
  summary: { success: number; failed: number; skipped: number };
}

// --- Action classification ---

/** Actions that are safe for auto-execution (non-destructive / repair-safe). */
const AUTO_SAFE_ACTIONS: RecommendationAction["type"][] = [
  "relink-all",
  "remove-stale",
  "enable-reminders",
  "adjust-frequency",
];

/**
 * Determine whether a recommendation's action can be auto-executed.
 *
 * Rules:
 * - relink-all: auto (high-confidence hash-verified moves)
 * - remove-stale: auto only when recommendation confidence is "high"
 *   (>50% missing ratio — stale entries are clearly orphaned)
 * - enable-reminders / adjust-frequency: auto (settings changes, easily reversible)
 * - No action: manual-only (informational)
 */
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
      return `Relinks moved documents to verified new locations.`;
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

// --- Ordering ---

/**
 * Execution order priority:
 * 1. relink-all (repair broken links first)
 * 2. remove-stale (clean up after relinking)
 * 3. enable-reminders (settings)
 * 4. adjust-frequency (settings)
 * 5. informational (manual-only, last)
 */
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

/**
 * Build a batch fix plan from a health check report's recommendations.
 * Filters out "all-clear" / pure-info items, orders by execution priority.
 */
export function buildBatchFixPlan(
  report: HealthCheckReport,
  now: Date = new Date(),
): BatchFixPlan {
  // Filter out all-clear and pure-info without actions
  const actionable = report.recommendations.filter(
    (r) => r.id !== "all-clear",
  );

  // Sort by execution order
  const sorted = [...actionable].sort(
    (a, b) => executionOrder(a) - executionOrder(b),
  );

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

/** Callbacks the executor uses to perform actual mutations. */
export interface BatchExecutionCallbacks {
  relinkDocument: (id: number, newPath: string) => Promise<void>;
  removeStaleDocuments: (ids: number[]) => Promise<void>;
  enableReminders: () => void;
  adjustFrequency: (freq: string) => void;
  /** Moved entries from the current integrity report. */
  movedEntries: Array<{ id: number; movedCandidate: string | null }>;
}

/**
 * Execute a confirmed batch fix plan.
 * - Auto steps are executed in order.
 * - Manual-only steps are skipped with a descriptive message.
 * - Each step records success/failure/skip with timing.
 */
export async function executeBatchFixPlan(
  plan: BatchFixPlan,
  callbacks: BatchExecutionCallbacks,
): Promise<BatchExecutionLog> {
  const startedAt = new Date().toISOString();
  const results: StepExecutionResult[] = [];

  for (const step of plan.steps) {
    if (step.kind === "manual-only") {
      results.push({
        stepId: step.stepId,
        outcome: "skipped",
        message: step.manualReason ?? "Manual intervention required.",
        durationMs: 0,
      });
      continue;
    }

    const t0 = performance.now();
    try {
      await executeStep(step, callbacks);
      results.push({
        stepId: step.stepId,
        outcome: "success",
        message: step.impact,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      results.push({
        stepId: step.stepId,
        outcome: "failed",
        message: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  const completedAt = new Date().toISOString();
  return {
    startedAt,
    completedAt,
    results,
    summary: {
      success: results.filter((r) => r.outcome === "success").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
    },
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
