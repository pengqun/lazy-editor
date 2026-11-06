import { DiagnosticsPanel } from "@/components/panels/DiagnosticsPanel";
import { invoke } from "@tauri-apps/api/core";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.mocked(invoke);

function health(overrides: { embedderOk: boolean; embedderDetail: string }) {
  return {
    ok: overrides.embedderOk,
    subsystems: [
      { name: "workspace", ok: true, detail: "No workspace set (optional)" },
      { name: "database", ok: true, detail: "OK — 0 documents" },
      {
        name: "embedder",
        ok: overrides.embedderOk,
        detail: overrides.embedderDetail,
      },
      { name: "settings", ok: true, detail: "Store writable" },
      { name: "ai_provider", ok: false, detail: "Settings file not found" },
    ],
  };
}

function diagnostics(embedderLoaded: boolean, embedderDetail: string) {
  return {
    app_version: "0.1.7",
    os: "macos",
    arch: "aarch64",
    tauri_version: "2.0.0",
    workspace_path: null,
    db_document_count: 0,
    db_path: "/tmp/knowledge.db",
    embedder_loaded: embedderLoaded,
    embedder_last_error: embedderLoaded ? null : "startup failed",
    health: health({ embedderOk: embedderLoaded, embedderDetail }),
  };
}

describe("DiagnosticsPanel embedder Re-run", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("updates embedder row after Re-run succeeds", async () => {
    let healthCalls = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "health_check") {
        healthCalls += 1;
        const embedderOk = healthCalls >= 2;
        return Promise.resolve(
          health({
            embedderOk,
            embedderDetail: embedderOk
              ? "Loaded (AllMiniLML6V2)"
              : "Initialization failed: startup failed — Press Re-run in Diagnostics to retry",
          }),
        );
      }
      if (cmd === "collect_diagnostics") {
        const embedderOk = healthCalls >= 2;
        return Promise.resolve(
          diagnostics(
            embedderOk,
            embedderOk
              ? "Loaded (AllMiniLML6V2)"
              : "Initialization failed: startup failed — Press Re-run in Diagnostics to retry",
          ),
        );
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    render(<DiagnosticsPanel onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Initialization failed: startup failed/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Re-run/i }));

    await waitFor(() => {
      expect(screen.getByText("Loaded (AllMiniLML6V2)")).toBeInTheDocument();
    });

    expect(healthCalls).toBeGreaterThanOrEqual(2);
  });
});
