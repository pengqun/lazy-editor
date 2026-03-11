import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

export interface SubsystemStatus {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  subsystems: SubsystemStatus[];
}

export interface DiagnosticsInfo {
  app_version: string;
  os: string;
  arch: string;
  tauri_version: string;
  workspace_path: string | null;
  db_document_count: number | null;
  db_path: string;
  embedder_loaded: boolean;
  health: HealthReport;
}

export async function runHealthCheck(): Promise<HealthReport> {
  return invoke<HealthReport>("health_check");
}

export async function collectDiagnostics(): Promise<DiagnosticsInfo> {
  return invoke<DiagnosticsInfo>("collect_diagnostics");
}

export function formatDiagnosticsReport(info: DiagnosticsInfo): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();

  lines.push("# Lazy Editor — Diagnostics Report");
  lines.push(`Generated: ${ts}`);
  lines.push("");
  lines.push("## App Info");
  lines.push(`- Version: ${info.app_version}`);
  lines.push(`- OS: ${info.os}`);
  lines.push(`- Arch: ${info.arch}`);
  lines.push(`- Tauri: ${info.tauri_version}`);
  lines.push("");
  lines.push("## Workspace");
  lines.push(`- Path: ${info.workspace_path ?? "(none)"}`);
  lines.push("");
  lines.push("## Knowledge Base");
  lines.push(`- DB path: ${info.db_path}`);
  lines.push(
    `- Documents: ${info.db_document_count !== null ? info.db_document_count : "unknown"}`,
  );
  lines.push(`- Embedder loaded: ${info.embedder_loaded ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Health Check");
  lines.push(`- Overall: ${info.health.ok ? "PASS" : "FAIL"}`);
  for (const s of info.health.subsystems) {
    lines.push(`- [${s.ok ? "OK" : "FAIL"}] ${s.name}: ${s.detail}`);
  }
  lines.push("");

  return lines.join("\n");
}

export async function exportDiagnostics(): Promise<string | null> {
  const info = await collectDiagnostics();
  const report = formatDiagnosticsReport(info);

  const filePath = await save({
    defaultPath: `lazy-editor-diagnostics-${Date.now()}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!filePath) return null;

  await writeTextFile(filePath, report);
  return filePath;
}
