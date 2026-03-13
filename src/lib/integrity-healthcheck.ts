/**
 * One-click KB integrity health check — orchestrates scan results, health metrics,
 * and actionable recommendations into a single report.
 */

import type { IntegrityReport, IntegrityScanSnapshot } from "@/stores/knowledge";
import type { IntegrityReminderSettings, ReminderFrequency } from "./integrity-reminder";
import {
  type HealthThresholdSettings,
  type HealthTier,
  type ScanCoverageMetrics,
  computeHealthTier,
  computeScanCoverage,
  toHealthThresholds,
} from "./integrity-health";
import {
  DEFAULT_RECOMMENDATION_THRESHOLDS,
  type RecommendationThresholdSettings,
} from "./integrity-recommendation-thresholds";

// --- Types ---

export type RecommendationPriority = "critical" | "high" | "medium" | "low" | "info";
export type RecommendationConfidence = "high" | "medium" | "low";

/** Quick action the UI can wire up for a recommendation. */
export type RecommendationAction =
  | { type: "relink-all" }
  | { type: "remove-stale"; ids: number[] }
  | { type: "enable-reminders" }
  | { type: "adjust-frequency"; suggested: ReminderFrequency };

export interface HealthCheckRecommendation {
  id: string;
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  rationale: string;
  title: string;
  description: string;
  action?: RecommendationAction;
}

/** Numeric weights for sorting: lower index = higher priority. */
const PRIORITY_ORDER: RecommendationPriority[] = ["critical", "high", "medium", "low", "info"];
const CONFIDENCE_ORDER: RecommendationConfidence[] = ["high", "medium", "low"];

/** Sort recommendations by priority (critical first), then confidence (high first). */
export function sortRecommendations(recs: HealthCheckRecommendation[]): HealthCheckRecommendation[] {
  return [...recs].sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(a.priority);
    const pb = PRIORITY_ORDER.indexOf(b.priority);
    if (pa !== pb) return pa - pb;

    const ca = CONFIDENCE_ORDER.indexOf(a.confidence);
    const cb = CONFIDENCE_ORDER.indexOf(b.confidence);
    if (ca !== cb) return ca - cb;

    // Deterministic tie-breaker for stable ordering in tests/UI snapshots.
    return a.id.localeCompare(b.id);
  });
}

export interface HealthCheckReport {
  timestamp: string;
  tier: HealthTier;
  metrics: ScanCoverageMetrics;
  counts: { total: number; healthy: number; missing: number; moved: number };
  recommendations: HealthCheckRecommendation[];
}

// --- Recommendation generation ---

const FREQUENCY_ORDER: ReminderFrequency[] = ["weekly", "every3days", "daily"];

function suggestFrequency(
  current: ReminderFrequency,
  tier: HealthTier,
): ReminderFrequency | null {
  if (tier === "good") return null;
  const idx = FREQUENCY_ORDER.indexOf(current);
  // Suggest one step more frequent if possible
  if (idx < FREQUENCY_ORDER.length - 1) return FREQUENCY_ORDER[idx + 1];
  return null; // already daily
}

function addSignalsRationale(summary: string, signals: string[]): string {
  if (signals.length === 0) return summary;
  return `${summary} Signals: ${signals.join("; ")}.`;
}

/**
 * Generate actionable recommendations based on scan report, health metrics, and settings.
 * Each recommendation carries a deterministic priority, confidence, and rationale
 * derived from the current health-check signals.
 */
export function generateRecommendations(
  report: IntegrityReport,
  metrics: ScanCoverageMetrics,
  tier: HealthTier,
  reminderSettings: IntegrityReminderSettings,
  thresholdOverrides?: Partial<RecommendationThresholdSettings>,
): HealthCheckRecommendation[] {
  const recs: HealthCheckRecommendation[] = [];
  const total = report.entries.length;
  const healthyRatio = total > 0 ? report.healthy / total : 1;
  const missingRatio = total > 0 ? report.missing / total : 0;
  const thresholds: RecommendationThresholdSettings = {
    ...DEFAULT_RECOMMENDATION_THRESHOLDS,
    ...thresholdOverrides,
  };

  // 1. Moved documents — suggest relink
  if (report.moved > 0) {
    // Single moved doc is often low-risk and can self-resolve later; avoid over-alerting.
    const movedPriority: RecommendationPriority = report.moved > thresholds.movedCriticalCount
      ? "critical"
      : report.moved > thresholds.movedHighCount
        ? "high"
        : "medium";
    recs.push({
      id: "relink-moved",
      priority: movedPriority,
      confidence: "high",
      rationale: addSignalsRationale(
        `${report.moved} document(s) have move candidates and file-hash matches.`,
        [
          `moved=${report.moved}`,
          `priority-threshold: >${thresholds.movedCriticalCount} => critical, >${thresholds.movedHighCount} => high, otherwise medium`,
        ],
      ),
      title: `Relink ${report.moved} moved document${report.moved > 1 ? "s" : ""}`,
      description:
        "Source files were found at new locations. Relinking restores the connection without re-ingesting.",
      action: { type: "relink-all" },
    });
  }

  // 2. Missing documents — suggest removal
  if (report.missing > 0) {
    const missingIds = report.entries
      .filter((e) => e.status === "missing")
      .map((e) => e.id);

    const tinyMissing =
      report.missing <= thresholds.tinyMissingMaxCount && missingRatio <= thresholds.tinyMissingMaxRatio;

    // Lower sensitivity on tiny missing set to reduce false positives from temporary path changes.
    const priority: RecommendationPriority = tinyMissing
      ? "low"
      : missingRatio > thresholds.missingCriticalRatio
        ? "critical"
        : report.missing > thresholds.missingHighCount
          ? "high"
          : "medium";
    const confidence: RecommendationConfidence = tinyMissing
      ? "low"
      : missingRatio > thresholds.missingCriticalRatio
        ? "high"
        : "medium";

    recs.push({
      id: "remove-missing",
      priority,
      confidence,
      rationale: addSignalsRationale(
        `${report.missing}/${total} entries are missing and have no move candidates.`,
        [
          `missing-ratio=${Math.round(missingRatio * 100)}%`,
          tinyMissing
            ? `tiny-missing pattern detected (<=${thresholds.tinyMissingMaxCount} item, <=${Math.round(thresholds.tinyMissingMaxRatio * 100)}%)`
            : "multi-item missing pattern",
        ],
      ),
      title: `Remove ${report.missing} stale entr${report.missing > 1 ? "ies" : "y"}`,
      description:
        "These source files are no longer found in the workspace. Removing cleans up the knowledge base.",
      action: { type: "remove-stale", ids: missingIds },
    });
  }

  // 3. Scan frequency / health tier
  if (tier === "poor" && metrics.latestScanAgeMs === null) {
    recs.push({
      id: "never-scanned",
      priority: "critical",
      confidence: "high",
      rationale: addSignalsRationale("No scan history exists; KB health is unknown.", ["latest-scan-age=null", "tier=poor"]),
      title: "Set up regular integrity scanning",
      description:
        "No scans have been recorded. Enable reminders to stay on top of KB health.",
      action: { type: "enable-reminders" },
    });
  } else if (tier === "poor" && metrics.latestScanAgeMs !== null) {
    const ageDays = Math.round(metrics.latestScanAgeMs / (24 * 60 * 60 * 1000));
    recs.push({
      id: "scan-stale",
      priority: "medium",
      confidence: "high",
      rationale: addSignalsRationale(`Last scan is stale and cadence is low.`, [
        `last-scan-age=${ageDays}d`,
        `scans-last-7d=${metrics.scansLast7d}`,
      ]),
      title: "Increase scan frequency",
      description:
        "Your last scan is old and recent scan count is low. More frequent scans catch issues earlier.",
    });
  }

  // 4. Reminder settings
  if (!reminderSettings.enabled && tier !== "good") {
    recs.push({
      id: "enable-reminders",
      priority: "medium",
      confidence: "medium",
      rationale: addSignalsRationale(`Reminders are disabled while tier is degraded.`, [
        `tier=${tier}`,
        "reminders=disabled",
      ]),
      title: "Enable scan reminders",
      description:
        "Reminders are currently off. Turning them on helps you maintain regular scanning habits.",
      action: { type: "enable-reminders" },
    });
  } else if (reminderSettings.enabled && tier !== "good") {
    const suggested = suggestFrequency(reminderSettings.frequency, tier);
    if (suggested) {
      recs.push({
        id: "adjust-frequency",
        priority: "low",
        confidence: "low",
        rationale: addSignalsRationale("Current reminder cadence may be insufficient.", [
          `current-frequency=${reminderSettings.frequency}`,
          `suggested-frequency=${suggested}`,
          `tier=${tier}`,
        ]),
        title: "Scan more often",
        description: `Consider switching reminders to "${suggested === "every3days" ? "every 3 days" : suggested}" for better coverage.`,
        action: { type: "adjust-frequency", suggested },
      });
    }
  }

  // 5. Health ratio warning (dedupe with missing-removal signals)
  const hasStrongMissingSignal = report.missing > 0 && missingRatio >= thresholds.missingStrongSignalRatio;
  if (total > 0 && !hasStrongMissingSignal) {
    if (healthyRatio < 0.5) {
      recs.push({
        id: "low-health-ratio",
        priority: "critical",
        confidence: "high",
        rationale: addSignalsRationale("Healthy ratio is below critical threshold.", [
          `healthy-ratio=${Math.round(healthyRatio * 100)}%`,
          "threshold=<50%",
        ]),
        title: "Majority of KB entries are broken",
        description: `Only ${Math.round(healthyRatio * 100)}% of documents have valid source references. Review and clean up your knowledge base.`,
      });
    } else if (healthyRatio < 0.8) {
      recs.push({
        id: "moderate-health-ratio",
        priority: "medium",
        confidence: "high",
        rationale: addSignalsRationale("Healthy ratio is below warning threshold.", [
          `healthy-ratio=${Math.round(healthyRatio * 100)}%`,
          "threshold=<80%",
        ]),
        title: "Several KB entries need attention",
        description: `${Math.round(healthyRatio * 100)}% of documents are healthy. Address the stale entries above to improve coverage.`,
      });
    }
  }

  // 6. De-duplication / conflict handling
  const ids = new Set(recs.map((r) => r.id));
  const deduped = recs.filter((rec) => {
    // never-scanned is root cause: drop stale/frequency tuning noise.
    if (ids.has("never-scanned") && (rec.id === "scan-stale" || rec.id === "adjust-frequency")) return false;
    // if reminders disabled, frequency tuning is not actionable yet.
    if (ids.has("enable-reminders") && rec.id === "adjust-frequency") return false;
    return true;
  });

  // 7. All clear
  if (deduped.length === 0) {
    deduped.push({
      id: "all-clear",
      priority: "info",
      confidence: "high",
      rationale: "All source references valid, scan coverage adequate, and no conflicting signals detected.",
      title: "KB is in great shape",
      description:
        "All source references are valid and scan coverage is good. No action needed.",
    });
  }

  return sortRecommendations(deduped);
}

// --- Orchestration ---

/**
 * Build a complete health check report from scan results and history.
 * This is the main orchestrator for the one-click health check workflow.
 */
export function buildHealthCheckReport(
  report: IntegrityReport,
  history: IntegrityScanSnapshot[],
  thresholdSettings: HealthThresholdSettings,
  reminderSettings: IntegrityReminderSettings,
  now: Date = new Date(),
): HealthCheckReport {
  const metrics = computeScanCoverage(history, now);
  const internalThresholds = toHealthThresholds(thresholdSettings);
  const tier = computeHealthTier(metrics, internalThresholds);
  const recommendations = generateRecommendations(report, metrics, tier, reminderSettings);

  return {
    timestamp: now.toISOString(),
    tier,
    metrics,
    counts: {
      total: report.entries.length,
      healthy: report.healthy,
      missing: report.missing,
      moved: report.moved,
    },
    recommendations,
  };
}
