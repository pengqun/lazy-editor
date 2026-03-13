import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBatchActionSlice, createIntegrityStateSlice, createViewerStateSlice, useKnowledgeStore } from "@/stores/knowledge";

const mockedInvoke = vi.mocked(invoke);

describe("knowledge store slices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("viewerState slice: viewChunk 成功时更新 chunk 与 query/score", async () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);
    const chunk = {
      chunkContent: "content",
      documentTitle: "Doc",
      documentId: 1,
      chunkId: 9,
      chunkIndex: 0,
      totalChunks: 1,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(chunk);

    await slice.viewChunk(9, "q", 0.5);

    expect(set).toHaveBeenNthCalledWith(1, {
      viewChunkLoading: true,
      viewChunkError: null,
      lastRequestedChunkId: 9,
    });
    expect(set).toHaveBeenNthCalledWith(2, {
      viewedChunk: chunk,
      viewChunkLoading: false,
      viewChunkError: null,
      viewedChunkQuery: "q",
      viewedChunkScore: 0.5,
    });
  });

  it("viewerState slice: setViewChunkError 保持兼容输出", () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);

    slice.setViewChunkError("malformed-link");

    expect(set).toHaveBeenCalledWith({
      viewedChunk: null,
      viewChunkLoading: false,
      viewChunkError: {
        kind: "malformed-link",
        message: "Malformed citation link — this reference is invalid.",
      },
    });
  });

  it("integrityState slice: checkIntegrity 成功后刷新 report 并触发历史加载", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const state: Record<string, any> = {
      _workspacePath: null,
      integrityHistory: [],
      reminderSettings: { enabled: true, frequency: "weekly", snoozedUntil: null },
      healthThresholds: { goodMinScans7d: 2, goodMaxAgeDays: 7, poorMaxAgeDays: 14 },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      updates.push(patch);
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createIntegrityStateSlice(set as any, get as any);
    Object.assign(state, slice);

    const report = { entries: [], healthy: 1, missing: 0, moved: 0 };
    mockedInvoke
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce([]);

    await slice.checkIntegrity();

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "check_kb_integrity");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "get_integrity_history");
    expect(state.integrityReport).toEqual(report);
    expect(state.integrityLoading).toBe(false);
    expect(updates[0]).toEqual({ integrityLoading: true });
  });

  it("integrityState slice: runHealthCheck 成功时调用扫描+历史并产出报告", async () => {
    const state: Record<string, any> = {
      _workspacePath: null,
      integrityHistory: [],
      reminderSettings: { enabled: true, frequency: "weekly", snoozedUntil: null },
      healthThresholds: { goodMinScans7d: 2, goodMaxAgeDays: 7, poorMaxAgeDays: 14 },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createIntegrityStateSlice(set as any, get as any);
    Object.assign(state, slice);

    mockedInvoke
      .mockResolvedValueOnce({ entries: [], healthy: 2, missing: 0, moved: 0 })
      .mockResolvedValueOnce([{ id: 1, scannedAt: "2026-03-13T10:00:00.000Z", total: 2, healthy: 2, missing: 0, moved: 0, notes: null }]);

    await slice.runHealthCheck();

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "check_kb_integrity");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "get_integrity_history");
    expect(state.healthCheckLoading).toBe(false);
    expect(state.healthCheckReport).toBeTruthy();
    expect(state.integrityHistory).toHaveLength(1);
  });

  it("integrityState slice: relinkDocument 调用后触发完整刷新链路", async () => {
    const state: Record<string, any> = {
      _workspacePath: null,
      integrityHistory: [],
      reminderSettings: { enabled: true, frequency: "weekly", snoozedUntil: null },
      healthThresholds: { goodMinScans7d: 2, goodMaxAgeDays: 7, poorMaxAgeDays: 14 },
      loadDocuments: vi.fn().mockResolvedValue(undefined),
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createIntegrityStateSlice(set as any, get as any);
    Object.assign(state, slice);

    mockedInvoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ entries: [], healthy: 1, missing: 0, moved: 0 })
      .mockResolvedValueOnce([]);

    await slice.relinkDocument(7, "/new/doc.md");

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "relink_kb_document", { id: 7, newPath: "/new/doc.md" });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "check_kb_integrity");
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, "get_integrity_history");
    expect(state.loadDocuments).toHaveBeenCalledTimes(1);
  });

  it("integrityState slice: removeStaleDocuments 与 clearIntegrity 基本行为", async () => {
    const state: Record<string, any> = {
      _workspacePath: null,
      integrityHistory: [],
      reminderSettings: { enabled: true, frequency: "weekly", snoozedUntil: null },
      healthThresholds: { goodMinScans7d: 2, goodMaxAgeDays: 7, poorMaxAgeDays: 14 },
      loadDocuments: vi.fn().mockResolvedValue(undefined),
      integrityReport: { entries: [], healthy: 1, missing: 0, moved: 0 },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createIntegrityStateSlice(set as any, get as any);
    Object.assign(state, slice);

    mockedInvoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ entries: [], healthy: 0, missing: 0, moved: 0 })
      .mockResolvedValueOnce([]);

    await slice.removeStaleDocuments([11, 12]);
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "remove_kb_document", { id: 11 });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "remove_kb_document", { id: 12 });

    slice.clearIntegrity();
    expect(state.integrityReport).toBeNull();
  });

  it("batchState slice: 提供稳定初始状态", () => {
    const slice = useKnowledgeStore.getState();
    expect(slice.batchFixPlan).toBeNull();
    expect(slice.batchLastPlan).toBeNull();
    expect(slice.batchExecuting).toBe(false);
    expect(slice.batchExecutionLog).toBeNull();
    expect(slice.batchStepStatuses).toEqual({});
  });

  it("batchAction slice: build/clear plan 基本行为", () => {
    const state: Record<string, any> = {
      healthCheckReport: {
        generatedAt: "2026-03-13T10:00:00.000Z",
        metrics: { total: 3, healthy: 2, missing: 1, moved: 0, invalid: 0 },
        trend: { scans7d: 1, latestStatus: "warning" },
        recommendations: [{
          id: "enable-reminders",
          priority: "medium",
          confidence: "high",
          title: "Enable reminders",
          description: "enable",
          rationale: "keep scanning",
          action: { type: "enable-reminders" },
        }],
      },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createBatchActionSlice(set as any, get as any);
    Object.assign(state, slice);

    slice.buildBatchPlan();
    expect(state.batchFixPlan).toBeTruthy();

    slice.clearBatchPlan();
    expect(state.batchFixPlan).toBeNull();
  });

  it("batchAction slice: clearHealthCheck 与 clearBatchLog 基本行为", () => {
    const state: Record<string, any> = {
      healthCheckReport: { foo: 1 },
      batchFixPlan: { foo: 1 },
      batchLastPlan: { foo: 1 },
      batchExecutionLog: { foo: 1 },
      batchStepStatuses: { "step-a": "failed" },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createBatchActionSlice(set as any, get as any);

    slice.clearBatchLog();
    expect(state.batchExecutionLog).toBeNull();
    expect(state.batchStepStatuses).toEqual({});

    Object.assign(state, { healthCheckReport: { foo: 1 }, batchFixPlan: { foo: 1 }, batchLastPlan: { foo: 1 }, batchExecutionLog: { foo: 1 }, batchStepStatuses: { x: "pending" } });
    slice.clearHealthCheck();
    expect(state.healthCheckReport).toBeNull();
    expect(state.batchFixPlan).toBeNull();
    expect(state.batchLastPlan).toBeNull();
    expect(state.batchExecutionLog).toBeNull();
    expect(state.batchStepStatuses).toEqual({});
  });

  it("兼容层：store 仍暴露原有 viewer/integrity/batch action 名称", () => {
    const state = useKnowledgeStore.getState();
    expect(typeof state.viewChunk).toBe("function");
    expect(typeof state.setViewChunkError).toBe("function");
    expect(typeof state.closeChunkViewer).toBe("function");
    expect(typeof state.dismissChunkError).toBe("function");
    expect(typeof state.checkIntegrity).toBe("function");
    expect(typeof state.loadIntegrityHistory).toBe("function");
    expect(typeof state.setReminderSettings).toBe("function");
    expect(typeof state.relinkDocument).toBe("function");
    expect(typeof state.removeStaleDocuments).toBe("function");
    expect(typeof state.clearIntegrity).toBe("function");
    expect(typeof state.runHealthCheck).toBe("function");
    expect(typeof state.buildBatchPlan).toBe("function");
    expect(typeof state.clearBatchPlan).toBe("function");
    expect(typeof state.confirmBatchPlan).toBe("function");
    expect(typeof state.retryBatchStep).toBe("function");
    expect(typeof state.clearBatchLog).toBe("function");
  });
});
