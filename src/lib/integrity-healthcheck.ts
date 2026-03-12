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

// --- Types ---

export type RecommendationPriority = "high" | "medium" | "low" | "info";

/** Quick action the UI can wire up for a recommendation. */
export type RecommendationAction =
  | { type: "relink-all" }
  | { type: "remove-stale"; ids: number[] }
  | { type: "enable-reminders" }
  | { type: "adjust-frequency"; suggested: ReminderFrequency };

export interface HealthCheckRecommendation {
  id: string;
  priority: RecommendationPriority;
  title: string;
  description: string;
  action?: RecommendationAction;
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

/**
 * Generate actionable recommendations based on scan report, health metrics, and settings.
 */
export function generateRecommendations(
  report: IntegrityReport,
  metrics: ScanCoverageMetrics,
  tier: HealthTier,
  reminderSettings: IntegrityReminderSettings,
): HealthCheckRecommendation[] {
  const recs: HealthCheckRecommendation[] = [];
  const total = report.entries.length;

  // 1. Moved documents — suggest relink
  if (report.moved > 0) {
    recs.push({
      id: "relink-moved",
      priority: "high",
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
    recs.push({
      id: "remove-missing",
      priority: report.missing > 3 ? "high" : "medium",
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
      priority: "high",
      title: "Set up regular integrity scanning",
      description:
        "No scans have been recorded. Enable reminders to stay on top of KB health.",
      action: { type: "enable-reminders" },
    });
  } else if (tier === "poor" && metrics.latestScanAgeMs !== null) {
    recs.push({
      id: "scan-stale",
      priority: "medium",
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
        title: "Scan more often",
        description: `Consider switching reminders to "${suggested === "every3days" ? "every 3 days" : suggested}" for better coverage.`,
        action: { type: "adjust-frequency", suggested },
      });
    }
  }

  // 5. Health ratio warning
  if (total > 0) {
    const healthyRatio = report.healthy / total;
    if (healthyRatio < 0.5) {
      recs.push({
        id: "low-health-ratio",
        priority: "high",
        title: "Majority of KB entries are broken",
        description: `Only ${Math.round(healthyRatio * 100)}% of documents have valid source references. Review and clean up your knowledge base.`,
      });
    } else if (healthyRatio < 0.8 && healthyRatio >= 0.5) {
      recs.push({
        id: "moderate-health-ratio",
        priority: "medium",
        title: "Several KB entries need attention",
        description: `${Math.round(healthyRatio * 100)}% of documents are healthy. Address the stale entries above to improve coverage.`,
      });
    }
  }

  // 6. All clear
  if (recs.length === 0) {
    recs.push({
      id: "all-clear",
      priority: "info",
      title: "KB is in great shape",
      description:
        "All source references are valid and scan coverage is good. No action needed.",
    });
  }

  return recs;
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
