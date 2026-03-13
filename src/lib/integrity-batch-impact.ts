import { computeBatchExecutionMetrics, type BatchExecutionLog } from "./integrity-batch-plan";

const STORAGE_PREFIX = "lazyeditor.integrity.batch-impact.v1:";

export interface BatchImpactSummary {
  completedAt: string;
  repairRate: number;
  hitRate: number;
  skipRate: number;
  successSteps: number;
  failedSteps: number;
  skippedSteps: number;
}

function getStorageKey(workspacePath: string | null): string {
  return `${STORAGE_PREFIX}${workspacePath ?? "global"}`;
}

function sanitizeRate(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function buildBatchImpactSummary(log: BatchExecutionLog): BatchImpactSummary {
  const metrics = computeBatchExecutionMetrics(log);
  return {
    completedAt: log.completedAt,
    repairRate: metrics.repairRate,
    hitRate: metrics.hitRate,
    skipRate: metrics.skipRate,
    successSteps: log.summary.success,
    failedSteps: log.summary.failed,
    skippedSteps: log.summary.skipped,
  };
}

export function shouldShowBatchImpact(summary: BatchImpactSummary | null): summary is BatchImpactSummary {
  return Boolean(summary && summary.completedAt);
}

export function loadBatchImpactSummary(workspacePath: string | null): BatchImpactSummary | null {
  try {
    const raw = localStorage.getItem(getStorageKey(workspacePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const completedAt = typeof parsed.completedAt === "string" ? parsed.completedAt : "";
    if (!completedAt) return null;
    return {
      completedAt,
      repairRate: sanitizeRate((parsed as Record<string, unknown>).repairRate),
      hitRate: sanitizeRate((parsed as Record<string, unknown>).hitRate),
      skipRate: sanitizeRate((parsed as Record<string, unknown>).skipRate),
      successSteps: sanitizeCount((parsed as Record<string, unknown>).successSteps),
      failedSteps: sanitizeCount((parsed as Record<string, unknown>).failedSteps),
      skippedSteps: sanitizeCount((parsed as Record<string, unknown>).skippedSteps),
    };
  } catch {
    return null;
  }
}

export function saveBatchImpactSummary(workspacePath: string | null, summary: BatchImpactSummary): void {
  try {
    localStorage.setItem(getStorageKey(workspacePath), JSON.stringify(summary));
  } catch {
    // localStorage full/disabled
  }
}
