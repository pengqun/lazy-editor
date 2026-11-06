import { KnowledgePanel } from "@/components/sidebar/KnowledgePanel";
import type { HealthCheckReport } from "@/lib/integrity-healthcheck";
import { listenToIngestProgress, openFileDialog } from "@/lib/tauri";
import { useFilesStore } from "@/stores/files";
import { useKnowledgeStore } from "@/stores/knowledge";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tauri")>();
  return {
    ...actual,
    openFileDialog: vi.fn(),
    listenToIngestProgress: vi.fn(() => () => {}),
  };
});

const mockedOpenFileDialog = vi.mocked(openFileDialog);
const mockedListenToIngestProgress = vi.mocked(listenToIngestProgress);

function makeEmptyHealthCheckReport(): HealthCheckReport {
  return {
    timestamp: "2026-03-12T12:00:00.000Z",
    tier: "empty",
    metrics: { scansLast7d: 1, scansLast30d: 1, latestScanAgeMs: 1000, streak: 1 },
    counts: { total: 0, healthy: 0, missing: 0, moved: 0 },
    recommendations: [
      {
        id: "kb-empty",
        priority: "high",
        confidence: "high",
        rationale: "No KB documents to score.",
        title: "Add your first document",
        description:
          "Your knowledge base has no documents yet. Import or paste a document so integrity checks can score source references.",
        action: { type: "add-document" },
      },
    ],
  };
}

function makeHealthyHealthCheckReport(): HealthCheckReport {
  return {
    timestamp: "2026-03-12T12:00:00.000Z",
    tier: "good",
    metrics: { scansLast7d: 3, scansLast30d: 10, latestScanAgeMs: 1000, streak: 2 },
    counts: { total: 2, healthy: 2, missing: 0, moved: 0 },
    recommendations: [
      {
        id: "all-clear",
        priority: "info",
        confidence: "high",
        rationale: "All clear.",
        title: "KB is in great shape",
        description: "No action needed.",
      },
    ],
  };
}

describe("KnowledgePanel HealthCheckCard (empty KB)", () => {
  let ingestFileSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockedListenToIngestProgress.mockReturnValue(() => {});
    ingestFileSpy = vi.fn().mockResolvedValue(undefined);

    useFilesStore.setState({ activeFilePath: null });
    useKnowledgeStore.setState({
      documents: [],
      searchResults: [],
      healthCheckReport: makeEmptyHealthCheckReport(),
      integrityReport: { entries: [], healthy: 0, missing: 0, moved: 0 },
      integrityHistory: [],
      integrityTrendHistory: [],
      batchFixPlan: null,
      batchExecuting: false,
      batchStepStatuses: {},
      batchExecutionLog: null,
      loadDocuments: vi.fn().mockResolvedValue(undefined),
      loadIntegrityHistory: vi.fn().mockResolvedValue(undefined),
      refreshReminderDue: vi.fn(),
      ingestFile: ingestFileSpy,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Empty tier and add-document recommendation in the health check card", () => {
    render(<KnowledgePanel />);

    expect(screen.getByText("Health Check")).toBeTruthy();
    expect(screen.getByText("Empty")).toBeTruthy();
    expect(screen.getByText("Add your first document")).toBeTruthy();
    expect(screen.queryByText("KB is in great shape")).toBeNull();
    expect(screen.queryByText("No action needed")).toBeNull();
  });

  it("Import document in the recommendation runs the same ingest flow as handleIngestFile", async () => {
    mockedOpenFileDialog.mockResolvedValue("/tmp/first-doc.md");

    render(<KnowledgePanel />);

    const title = screen.getByText("Add your first document");
    const recBlock = title.closest(".flex-1");
    expect(recBlock).toBeTruthy();
    const importButton = within(recBlock as HTMLElement).getByRole("button", {
      name: "Import document",
    });

    fireEvent.click(importButton);

    await waitFor(() => {
      expect(mockedOpenFileDialog).toHaveBeenCalledTimes(1);
      expect(ingestFileSpy).toHaveBeenCalledWith("/tmp/first-doc.md");
    });
  });
});

describe("KnowledgePanel HealthCheckCard (non-empty KB)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockedListenToIngestProgress.mockReturnValue(() => {});

    useFilesStore.setState({ activeFilePath: null });
    useKnowledgeStore.setState({
      documents: [
        {
          id: 1,
          title: "Doc 1",
          sourceType: "file",
          sourcePath: "/doc.md",
          createdAt: "2024-01-01",
          chunkCount: 3,
        },
      ],
      searchResults: [],
      loadDocuments: vi.fn().mockResolvedValue(undefined),
      loadIntegrityHistory: vi.fn().mockResolvedValue(undefined),
      refreshReminderDue: vi.fn(),
      healthCheckReport: makeHealthyHealthCheckReport(),
      integrityReport: {
        entries: [
          {
            id: 1,
            title: "Doc 1",
            sourcePath: "/doc.md",
            status: "healthy",
            movedCandidate: null,
          },
        ],
        healthy: 1,
        missing: 0,
        moved: 0,
      },
      integrityHistory: [],
      integrityTrendHistory: [],
      batchFixPlan: null,
      batchExecuting: false,
      batchStepStatuses: {},
      batchExecutionLog: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not show empty-KB guidance when documents exist", () => {
    render(<KnowledgePanel />);

    expect(screen.getByText("Good")).toBeTruthy();
    expect(screen.getByText("KB is in great shape")).toBeTruthy();
    expect(screen.queryByText("Empty")).toBeNull();
    expect(screen.queryByRole("button", { name: "Import document" })).toBeNull();
  });
});
