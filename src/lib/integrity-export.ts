import type { IntegrityEntry, IntegrityReport, IntegrityScanSnapshot } from "@/stores/knowledge";
import { buildBatchFixPlan, formatEstimatedImpact, summarizeEstimatedImpact } from "./integrity-batch-plan";
import type { HealthCheckReport } from "./integrity-healthcheck";

export interface IntegrityExportPayload {
  scanTimestamp: string;
  summary: { total: number; healthy: number; missing: number; moved: number };
  entries: IntegrityEntry[];
  history?: IntegrityScanSnapshot[];
  healthCheck?: HealthCheckReport;
}

export interface IntegrityTrend {
  healthyDelta: number;
  missingDelta: number;
  movedDelta: number;
  totalDelta: number;
}

/** Compute trend deltas between latest and previous scan snapshot. Returns null if fewer than 2 snapshots. */
export function computeTrend(history: IntegrityScanSnapshot[]): IntegrityTrend | null {
  if (history.length < 2) return null;
  const latest = history[0];
  const previous = history[1];
  return {
    healthyDelta: latest.healthy - previous.healthy,
    missingDelta: latest.missing - previous.missing,
    movedDelta: latest.moved - previous.moved,
    totalDelta: latest.total - previous.total,
  };
}

/** Format a delta number as a signed string (e.g., "+2", "-1", "0"). */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function buildExportPayload(
  report: IntegrityReport,
  history?: IntegrityScanSnapshot[],
  healthCheck?: HealthCheckReport,
): IntegrityExportPayload {
  return {
    scanTimestamp: new Date().toISOString(),
    summary: {
      total: report.entries.length,
      healthy: report.healthy,
      missing: report.missing,
      moved: report.moved,
    },
    entries: report.entries,
    ...(history && history.length > 0 ? { history } : {}),
    ...(healthCheck ? { healthCheck } : {}),
  };
}

export function formatJSON(payload: IntegrityExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

const TIER_LABEL_MAP: Record<string, string> = {
  good: "Good",
  warning: "Fair",
  poor: "Poor",
};

const PRIORITY_LABEL_MAP: Record<string, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

const CONFIDENCE_LABEL_MAP: Record<string, string> = {
  high: "high",
  medium: "med",
  low: "low",
};

export function formatMarkdown(payload: IntegrityExportPayload): string {
  const { scanTimestamp, summary, entries, history, healthCheck } = payload;
  const lines: string[] = [];

  lines.push("# KB Integrity Report");
  lines.push("");
  lines.push(`**Scanned:** ${scanTimestamp}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Healthy | ${summary.healthy} |`);
  lines.push(`| Moved | ${summary.moved} |`);
  lines.push(`| Missing | ${summary.missing} |`);
  lines.push(`| **Total** | **${summary.total}** |`);
  lines.push("");

  if (entries.length === 0) {
    lines.push("_No documents scanned._");
  } else {
    lines.push("## Documents");
    lines.push("");
    lines.push("| ID | Title | Source Path | Status | Notes |");
    lines.push("|----|-------|-------------|--------|-------|");

    for (const e of entries) {
      const notes = e.movedCandidate ? `Candidate: ${e.movedCandidate}` : "";
      const escapedTitle = e.title.replace(/\|/g, "\\|");
      const escapedPath = e.sourcePath.replace(/\|/g, "\\|");
      const escapedNotes = notes.replace(/\|/g, "\\|");
      lines.push(`| ${e.id} | ${escapedTitle} | ${escapedPath} | ${e.status} | ${escapedNotes} |`);
    }
  }

  // History section (if available)
  if (history && history.length > 0) {
    lines.push("");
    lines.push("## Scan History");
    lines.push("");
    lines.push("| # | Scanned At | Total | Healthy | Missing | Moved | Notes |");
    lines.push("|---|------------|-------|---------|---------|-------|-------|");
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const notes = h.notes ? h.notes.replace(/\|/g, "\\|") : "";
      lines.push(`| ${i + 1} | ${h.scannedAt} | ${h.total} | ${h.healthy} | ${h.missing} | ${h.moved} | ${notes} |`);
    }
  }

  // Health check section (if available)
  if (healthCheck) {
    lines.push("");
    lines.push("## Health Check");
    lines.push("");
    lines.push(`**Status:** ${TIER_LABEL_MAP[healthCheck.tier] ?? healthCheck.tier}`);
    lines.push(`**Last scan:** ${healthCheck.metrics.latestScanAgeMs !== null ? `${Math.round(healthCheck.metrics.latestScanAgeMs / 3600000)}h ago` : "never"}`);
    lines.push(`**7-day scans:** ${healthCheck.metrics.scansLast7d} | **30-day scans:** ${healthCheck.metrics.scansLast30d} | **Streak:** ${healthCheck.metrics.streak}d`);
    const batchPlan = buildBatchFixPlan(healthCheck);
    const estimatedImpact = formatEstimatedImpact(
      summarizeEstimatedImpact(batchPlan, healthCheck.counts.moved),
    );
    lines.push(`**Estimated impact:** ${estimatedImpact}`);
    lines.push("");
    lines.push("### Recommendations");
    lines.push("");
    for (const rec of healthCheck.recommendations) {
      const pLabel = PRIORITY_LABEL_MAP[rec.priority] ?? rec.priority;
      const cLabel = rec.confidence ? ` (confidence: ${CONFIDENCE_LABEL_MAP[rec.confidence] ?? rec.confidence})` : "";
      lines.push(`- **[${pLabel}]**${cLabel} ${rec.title} — ${rec.description}`);
      if (rec.rationale) {
        lines.push(`  - _Rationale:_ ${rec.rationale}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
