import { buildExportFilename, formatDiagnosticsReport } from "@/lib/diagnostics";
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

describe("buildExportFilename", () => {
  it("produces the expected format with date, time, and version", () => {
    const date = new Date(2026, 2, 11, 16, 38, 17); // March 11, 2026, 16:38:17
    const filename = buildExportFilename("0.1.0", date);
    expect(filename).toBe("lazy-editor-diagnostics-2026-03-11T16-38-17-v0.1.0.md");
  });

  it("zero-pads single-digit month, day, hour, minute, second", () => {
    const date = new Date(2026, 0, 5, 3, 7, 9); // Jan 5, 2026, 03:07:09
    const filename = buildExportFilename("1.2.3", date);
    expect(filename).toBe("lazy-editor-diagnostics-2026-01-05T03-07-09-v1.2.3.md");
  });

  it("ends with .md extension", () => {
    const filename = buildExportFilename("0.1.0", new Date(2026, 5, 15, 12, 0, 0));
    expect(filename).toMatch(/\.md$/);
  });

  it("contains the version prefixed with v", () => {
    const filename = buildExportFilename("2.0.0-beta.1", new Date(2026, 0, 1, 0, 0, 0));
    expect(filename).toContain("-v2.0.0-beta.1.md");
  });

  it("does not contain colons (filesystem-safe)", () => {
    const filename = buildExportFilename("0.1.0", new Date());
    expect(filename).not.toContain(":");
  });

  it("starts with lazy-editor-diagnostics prefix", () => {
    const filename = buildExportFilename("0.1.0", new Date());
    expect(filename).toMatch(/^lazy-editor-diagnostics-/);
  });

  it("handles midnight correctly", () => {
    const date = new Date(2026, 11, 31, 0, 0, 0); // Dec 31, 2026, 00:00:00
    const filename = buildExportFilename("0.1.0", date);
    expect(filename).toBe("lazy-editor-diagnostics-2026-12-31T00-00-00-v0.1.0.md");
  });

  it("handles end-of-day correctly", () => {
    const date = new Date(2026, 11, 31, 23, 59, 59); // Dec 31, 2026, 23:59:59
    const filename = buildExportFilename("0.1.0", date);
    expect(filename).toBe("lazy-editor-diagnostics-2026-12-31T23-59-59-v0.1.0.md");
  });

  it("does not include sensitive keys", () => {
    const filename = buildExportFilename("0.1.0", new Date());
    expect(filename).not.toContain("sk-");
    expect(filename).not.toContain("apiKey");
    expect(filename).not.toContain("api_key");
  });
});
