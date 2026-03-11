import { formatDiagnosticsReport } from "@/lib/diagnostics";
import type { DiagnosticsInfo } from "@/lib/diagnostics";
import { describe, expect, it } from "vitest";

function makeDiagnostics(overrides?: Partial<DiagnosticsInfo>): DiagnosticsInfo {
  return {
    app_version: "0.1.0",
    os: "macos",
    arch: "aarch64",
    tauri_version: "2.3.0",
    workspace_path: "/Users/test/docs",
    db_document_count: 12,
    db_path: "/Users/test/Library/lazy-editor/knowledge.db",
    embedder_loaded: true,
    health: {
      ok: true,
      subsystems: [
        { name: "workspace", ok: true, detail: "Readable: /Users/test/docs" },
        { name: "database", ok: true, detail: "OK — 12 documents" },
        { name: "embedder", ok: true, detail: "Loaded (AllMiniLML6V2)" },
        { name: "settings", ok: true, detail: "Tauri plugin-store available" },
      ],
    },
    ...overrides,
  };
}

describe("formatDiagnosticsReport", () => {
  it("produces a markdown report with app info", () => {
    const report = formatDiagnosticsReport(makeDiagnostics());
    expect(report).toContain("# Lazy Editor — Diagnostics Report");
    expect(report).toContain("Version: 0.1.0");
    expect(report).toContain("OS: macos");
    expect(report).toContain("Arch: aarch64");
    expect(report).toContain("Tauri: 2.3.0");
  });

  it("includes workspace path", () => {
    const report = formatDiagnosticsReport(makeDiagnostics());
    expect(report).toContain("Path: /Users/test/docs");
  });

  it("shows (none) when workspace is null", () => {
    const report = formatDiagnosticsReport(makeDiagnostics({ workspace_path: null }));
    expect(report).toContain("Path: (none)");
  });

  it("includes knowledge base info", () => {
    const report = formatDiagnosticsReport(makeDiagnostics());
    expect(report).toContain("Documents: 12");
    expect(report).toContain("Embedder loaded: yes");
  });

  it("shows unknown when db_document_count is null", () => {
    const report = formatDiagnosticsReport(makeDiagnostics({ db_document_count: null }));
    expect(report).toContain("Documents: unknown");
  });

  it("shows embedder not loaded", () => {
    const report = formatDiagnosticsReport(makeDiagnostics({ embedder_loaded: false }));
    expect(report).toContain("Embedder loaded: no");
  });

  it("includes health check results", () => {
    const report = formatDiagnosticsReport(makeDiagnostics());
    expect(report).toContain("Overall: PASS");
    expect(report).toContain("[OK] workspace");
    expect(report).toContain("[OK] database");
  });

  it("shows FAIL when health is not ok", () => {
    const info = makeDiagnostics({
      health: {
        ok: false,
        subsystems: [
          { name: "workspace", ok: false, detail: "Cannot read directory: ENOENT" },
          { name: "database", ok: true, detail: "OK — 0 documents" },
        ],
      },
    });
    const report = formatDiagnosticsReport(info);
    expect(report).toContain("Overall: FAIL");
    expect(report).toContain("[FAIL] workspace");
    expect(report).toContain("[OK] database");
  });

  it("does not include API keys or secrets", () => {
    const report = formatDiagnosticsReport(makeDiagnostics());
    expect(report).not.toContain("sk-");
    expect(report).not.toContain("apiKey");
    expect(report).not.toContain("api_key");
  });
});
