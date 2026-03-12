import type { IntegrityEntry, IntegrityReport } from "@/stores/knowledge";

export interface IntegrityExportPayload {
  scanTimestamp: string;
  summary: { total: number; healthy: number; missing: number; moved: number };
  entries: IntegrityEntry[];
}

export function buildExportPayload(report: IntegrityReport): IntegrityExportPayload {
  return {
    scanTimestamp: new Date().toISOString(),
    summary: {
      total: report.entries.length,
      healthy: report.healthy,
      missing: report.missing,
      moved: report.moved,
    },
    entries: report.entries,
  };
}

export function formatJSON(payload: IntegrityExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function formatMarkdown(payload: IntegrityExportPayload): string {
  const { scanTimestamp, summary, entries } = payload;
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
    lines.push("");
    return lines.join("\n");
  }

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

  lines.push("");
  return lines.join("\n");
}
