import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBatchActionSlice, createBatchStateSlice, createIntegrityStateSlice, createViewerStateSlice, useKnowledgeStore } from "@/stores/knowledge";
import {
  buildViewChunkError,
  classifyViewChunkError,
  createViewerStateSlice as createViewerStateSliceDirect,
} from "@/stores/knowledge/viewer";
import {
  createIntegrityStateSlice as createIntegrityStateSliceDirect,
} from "@/stores/knowledge/integrity";
import { createBatchActionSlice as createBatchActionSliceDirect, createBatchStateSlice as createBatchStateSliceDirect } from "@/stores/knowledge/batch";
import * as batchPlanModule from "@/lib/integrity-batch-plan";

// Raw source imports for guardian tests
import viewerRaw from "@/stores/knowledge/viewer.ts?raw";
import integrityRaw from "@/stores/knowledge/integrity.ts?raw";
import batchRaw from "@/stores/knowledge/batch.ts?raw";
import typesRaw from "@/stores/knowledge/types.ts?raw";
import integrityUtilsRaw from "@/stores/knowledge/integrity-utils.ts?raw";
import refreshRaw from "@/stores/knowledge/refresh.ts?raw";
import aggregationRaw from "@/stores/knowledge.ts?raw";

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

  it("viewer module: direct import produces identical slice", () => {
    const set = vi.fn();
    const sliceViaReexport = createViewerStateSlice(set);
    const sliceDirect = createViewerStateSliceDirect(set);
    expect(Object.keys(sliceDirect).sort()).toEqual(Object.keys(sliceViaReexport).sort());
  });

  it("viewer module: buildViewChunkError covers all error kinds", () => {
    expect(buildViewChunkError("source-missing").kind).toBe("source-missing");
    expect(buildViewChunkError("chunk-missing").kind).toBe("chunk-missing");
    expect(buildViewChunkError("malformed-link").kind).toBe("malformed-link");
  });

  it("viewer module: classifyViewChunkError maps structured error codes to kinds", () => {
    // Structured codes from Rust backend
    expect(classifyViewChunkError("source-not-found:7")).toBe("source-missing");
    expect(classifyViewChunkError("source-not-found:123")).toBe("source-missing");
    expect(classifyViewChunkError("chunk-not-found:42")).toBe("chunk-missing");
    expect(classifyViewChunkError("chunk-not-found:999")).toBe("chunk-missing");
    expect(classifyViewChunkError("chunk-error:database locked")).toBe("chunk-missing");
    // Frontend-only error kinds
    expect(classifyViewChunkError(new Error("malformed link"))).toBe("malformed-link");
    // Fallback for unknown errors
    expect(classifyViewChunkError("unknown error")).toBe("chunk-missing");
  });

  it("guardian: ViewChunkErrorKind type literals match buildViewChunkError coverage", () => {
    // Extract the literal union members from the type definition source
    const match = typesRaw.match(/type\s+ViewChunkErrorKind\s*=\s*([^;]+)/);
    expect(match).not.toBeNull();
    const kinds = match![1]
      .split("|")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    expect(kinds.length).toBeGreaterThanOrEqual(3);

    // Every kind declared in the type must be handled by buildViewChunkError
    for (const kind of kinds) {
      const result = buildViewChunkError(kind as never);
      expect(result.kind).toBe(kind);
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("guardian: classifyViewChunkError maps every backend prefix to a declared kind", () => {
    // Extract declared error kinds from type source
    const match = typesRaw.match(/type\s+ViewChunkErrorKind\s*=\s*([^;]+)/);
    const declaredKinds = new Set(
      match![1].split("|").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean),
    );

    // Every backend prefix pattern in classifyViewChunkError must map to a declared kind
    const backendPrefixes: [string, string][] = [
      ["source-not-found:1", "source-missing"],
      ["chunk-not-found:1", "chunk-missing"],
      ["chunk-error:err", "chunk-missing"],
    ];
    for (const [input, expectedKind] of backendPrefixes) {
      const result = classifyViewChunkError(input);
      expect(result).toBe(expectedKind);
      expect(declaredKinds.has(result)).toBe(true);
    }
  });

  it("viewer module: viewChunk failure sets error state", async () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);
    mockedInvoke.mockRejectedValueOnce("chunk-not-found:42");

    await slice.viewChunk(42);

    expect(set).toHaveBeenNthCalledWith(1, {
      viewChunkLoading: true,
      viewChunkError: null,
      lastRequestedChunkId: 42,
    });
    expect(set).toHaveBeenNthCalledWith(2, {
      viewedChunk: null,
      viewChunkLoading: false,
      viewChunkError: { kind: "chunk-missing", message: expect.stringContaining("no longer exists") },
    });
  });

  it("viewer module: closeChunkViewer resets all viewer state", () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);

    slice.closeChunkViewer();

    expect(set).toHaveBeenCalledWith({
      viewedChunk: null,
      lastRequestedChunkId: null,
      viewChunkError: null,
      viewedChunkQuery: null,
      viewedChunkScore: null,
    });
  });

  it("viewer module: dismissChunkError only clears error", () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);

    slice.dismissChunkError();

    expect(set).toHaveBeenCalledWith({ viewChunkError: null });
  });

  it("viewer module: viewChunk without query/score omits those fields", async () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);
    const chunk = {
      chunkContent: "c", documentTitle: "D", documentId: 1, chunkId: 5,
      chunkIndex: 0, totalChunks: 1, prevChunk: null, nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(chunk);

    await slice.viewChunk(5);

    expect(set).toHaveBeenNthCalledWith(2, {
      viewedChunk: chunk,
      viewChunkLoading: false,
      viewChunkError: null,
    });
  });

  it("viewer module: initial state values are correct", () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);
    expect(slice.viewedChunk).toBeNull();
    expect(slice.lastRequestedChunkId).toBeNull();
    expect(slice.viewChunkLoading).toBe(false);
    expect(slice.viewChunkError).toBeNull();
    expect(slice.viewedChunkQuery).toBeNull();
    expect(slice.viewedChunkScore).toBeNull();
  });

  it("integrity module: direct import produces identical slice keys", () => {
    const set = vi.fn();
    const get = (() => ({})) as any;
    const sliceViaReexport = createIntegrityStateSlice(set, get);
    const sliceDirect = createIntegrityStateSliceDirect(set, get);
    expect(Object.keys(sliceDirect).sort()).toEqual(Object.keys(sliceViaReexport).sort());
  });

  it("integrity module: initial state values are correct", () => {
    const set = vi.fn();
    const get = (() => ({})) as any;
    const slice = createIntegrityStateSliceDirect(set, get);
    expect(slice.integrityReport).toBeNull();
    expect(slice.integrityLoading).toBe(false);
    expect(slice.integrityHistory).toEqual([]);
    expect(slice.reminderDue).toBe(false);
    expect(slice.healthCheckReport).toBeNull();
    expect(slice.healthCheckLoading).toBe(false);
  });

  it("batch module: direct import produces identical slice keys", () => {
    const stateSlice = createBatchStateSlice();
    const stateSliceDirect = createBatchStateSliceDirect();
    expect(Object.keys(stateSliceDirect).sort()).toEqual(Object.keys(stateSlice).sort());

    const set = vi.fn();
    const get = (() => ({})) as any;
    const actionSlice = createBatchActionSlice(set, get);
    const actionSliceDirect = createBatchActionSliceDirect(set, get);
    expect(Object.keys(actionSliceDirect).sort()).toEqual(Object.keys(actionSlice).sort());
  });

  it("cross-slice: confirmBatchPlan calls loadDocuments + checkIntegrity after execution", async () => {
    const loadDocuments = vi.fn().mockResolvedValue(undefined);
    const checkIntegrity = vi.fn().mockResolvedValue(undefined);
    const setReminderSettings = vi.fn();
    const state: Record<string, any> = {
      _workspacePath: null,
      integrityReport: null,
      setReminderSettings,
      loadDocuments,
      checkIntegrity,
      batchFixPlan: {
        generatedAt: "2026-03-14T00:00:00Z",
        steps: [{ stepId: "step-1", type: "enable-reminders", title: "Enable", description: "d", actionPayload: {} }],
      },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createBatchActionSlice(set as any, get as any);
    Object.assign(state, slice);

    // Mock executeBatchFixPlan to return a minimal successful log
    const executeSpy = vi.spyOn(batchPlanModule, "executeBatchFixPlan").mockResolvedValueOnce({
      startedAt: "2026-03-14T00:00:00Z",
      completedAt: "2026-03-14T00:00:01Z",
      results: [{ stepId: "step-1", recommendationId: "enable-reminders", actionType: "enable-reminders", status: "success" as const, outcome: "success", message: "ok", durationMs: 1, attempts: 1, affectedItems: 0 }],
      summary: { success: 1, failed: 0, skipped: 0, itemChanges: { success: 0, failed: 0, skipped: 0, total: 0 } },
    });

    await slice.confirmBatchPlan();

    expect(executeSpy).toHaveBeenCalledTimes(1);
    // Cross-slice calls must happen after batch execution
    expect(loadDocuments).toHaveBeenCalledTimes(1);
    expect(checkIntegrity).toHaveBeenCalledTimes(1);
    // Batch state must be cleaned up
    expect(state.batchFixPlan).toBeNull();
    expect(state.batchExecuting).toBe(false);
    expect(state.batchExecutionLog).toBeTruthy();

    executeSpy.mockRestore();
  });

  it("cross-slice: retryBatchStep calls loadDocuments + checkIntegrity on success", async () => {
    const loadDocuments = vi.fn().mockResolvedValue(undefined);
    const checkIntegrity = vi.fn().mockResolvedValue(undefined);
    const setReminderSettings = vi.fn();
    const state: Record<string, any> = {
      _workspacePath: null,
      integrityReport: null,
      setReminderSettings,
      loadDocuments,
      checkIntegrity,
      batchLastPlan: {
        generatedAt: "2026-03-14T00:00:00Z",
        steps: [{ stepId: "step-1", type: "enable-reminders", title: "Enable", description: "d", actionPayload: {} }],
      },
      batchExecutionLog: {
        startedAt: "2026-03-14T00:00:00Z",
        completedAt: "2026-03-14T00:00:01Z",
        results: [{ stepId: "step-1", outcome: "failed", message: "err", attempts: 1, itemsChanged: 0 }],
        summary: { success: 0, failed: 1, skipped: 0, itemChanges: { success: 0, failed: 0 } },
      },
      batchStepStatuses: { "step-1": "failed" },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createBatchActionSlice(set as any, get as any);
    Object.assign(state, slice);

    const retrySpy = vi.spyOn(batchPlanModule, "executeBatchStep").mockResolvedValueOnce({
      stepId: "step-1", recommendationId: "enable-reminders", actionType: "enable-reminders", status: "success" as const, outcome: "success", message: "ok", durationMs: 1, attempts: 2, affectedItems: 1,
    });

    await slice.retryBatchStep("step-1");

    expect(retrySpy).toHaveBeenCalledTimes(1);
    // On success, cross-slice refresh must happen
    expect(loadDocuments).toHaveBeenCalledTimes(1);
    expect(checkIntegrity).toHaveBeenCalledTimes(1);

    retrySpy.mockRestore();
  });

  it("cross-slice: retryBatchStep does NOT call loadDocuments/checkIntegrity on failure", async () => {
    const loadDocuments = vi.fn().mockResolvedValue(undefined);
    const checkIntegrity = vi.fn().mockResolvedValue(undefined);
    const setReminderSettings = vi.fn();
    const state: Record<string, any> = {
      _workspacePath: null,
      integrityReport: null,
      setReminderSettings,
      loadDocuments,
      checkIntegrity,
      batchLastPlan: {
        generatedAt: "2026-03-14T00:00:00Z",
        steps: [{ stepId: "step-2", type: "enable-reminders", title: "Enable", description: "d", actionPayload: {} }],
      },
      batchExecutionLog: {
        startedAt: "2026-03-14T00:00:00Z",
        completedAt: "2026-03-14T00:00:01Z",
        results: [{ stepId: "step-2", outcome: "failed", message: "err", attempts: 1, itemsChanged: 0 }],
        summary: { success: 0, failed: 1, skipped: 0, itemChanges: { success: 0, failed: 0 } },
      },
      batchStepStatuses: { "step-2": "failed" },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createBatchActionSlice(set as any, get as any);
    Object.assign(state, slice);

    const retrySpy = vi.spyOn(batchPlanModule, "executeBatchStep").mockResolvedValueOnce({
      stepId: "step-2", recommendationId: "enable-reminders", actionType: "enable-reminders", status: "failed" as const, outcome: "failed", message: "still broken", durationMs: 1, attempts: 2, affectedItems: 0,
    });

    await slice.retryBatchStep("step-2");

    // On failure, cross-slice refresh must NOT happen
    expect(loadDocuments).not.toHaveBeenCalled();
    expect(checkIntegrity).not.toHaveBeenCalled();

    retrySpy.mockRestore();
  });

  it("cross-slice: clearHealthCheck resets integrity healthCheckReport alongside batch state", () => {
    const state: Record<string, any> = {
      healthCheckReport: { generatedAt: "t", metrics: {}, trend: {}, recommendations: [] },
      batchFixPlan: { steps: [] },
      batchLastPlan: { steps: [] },
      batchExecutionLog: { results: [] },
      batchStepStatuses: { "step-1": "success" },
    };
    const set = vi.fn((partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    });
    const get = () => state as any;
    const slice = createBatchActionSlice(set as any, get as any);

    slice.clearHealthCheck();

    // Integrity state field
    expect(state.healthCheckReport).toBeNull();
    // Batch state fields
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

  it("public API: all documented type re-exports resolve from @/stores/knowledge", async () => {
    // Verify type re-exports are importable (runtime check for non-type exports)
    const mod = await import("@/stores/knowledge");
    // Slice factories
    expect(typeof mod.createViewerStateSlice).toBe("function");
    expect(typeof mod.createIntegrityStateSlice).toBe("function");
    expect(typeof mod.createBatchStateSlice).toBe("function");
    expect(typeof mod.createBatchActionSlice).toBe("function");
    // Store hook
    expect(typeof mod.useKnowledgeStore).toBe("function");
  });

  it("guardian: slice modules do not import from aggregation layer '../knowledge'", () => {
    const sliceSources = { viewerRaw, integrityRaw, batchRaw, typesRaw, integrityUtilsRaw, refreshRaw };
    for (const [name, source] of Object.entries(sliceSources)) {
      // Must not import from "../knowledge" (the aggregation layer)
      expect(source, `${name} imports from ../knowledge`).not.toMatch(/from\s+["']\.\.\/knowledge["']/);
      // Must not import useKnowledgeStore
      expect(source, `${name} references useKnowledgeStore`).not.toMatch(/useKnowledgeStore/);
    }
  });

  it("guardian: aggregation layer knowledge.ts stays under 220 lines", () => {
    const lineCount = aggregationRaw.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(220);
  });

  it("guardian: each slice factory returns all required initial fields", () => {
    const set = vi.fn();
    const get = (() => ({})) as any;

    // viewer must include all state + action fields
    const viewerKeys = Object.keys(createViewerStateSlice(set)).sort();
    const requiredViewerKeys = [
      "viewedChunk", "lastRequestedChunkId", "viewChunkLoading", "viewChunkError",
      "viewedChunkQuery", "viewedChunkScore",
      "viewChunk", "setViewChunkError", "closeChunkViewer", "dismissChunkError",
    ].sort();
    expect(viewerKeys).toEqual(requiredViewerKeys);

    // batch state must include all state fields
    const batchStateKeys = Object.keys(createBatchStateSlice()).sort();
    const requiredBatchStateKeys = [
      "batchFixPlan", "batchLastPlan", "batchExecuting",
      "batchStepStatuses", "batchExecutionLog", "lastBatchImpact",
    ].sort();
    expect(batchStateKeys).toEqual(requiredBatchStateKeys);

    // batch action must include all action fields
    const batchActionKeys = Object.keys(createBatchActionSlice(set, get)).sort();
    const requiredBatchActionKeys = [
      "clearHealthCheck", "buildBatchPlan", "clearBatchPlan",
      "confirmBatchPlan", "retryBatchStep", "clearBatchLog",
    ].sort();
    expect(batchActionKeys).toEqual(requiredBatchActionKeys);

    // integrity must include all required keys (superset check — new keys are allowed)
    const integrityKeys = Object.keys(createIntegrityStateSlice(set, get));
    const requiredIntegrityKeys = [
      "integrityReport", "integrityLoading", "integrityHistory",
      "checkIntegrity", "relinkDocument", "removeStaleDocuments", "clearIntegrity",
      "loadIntegrityHistory", "reminderSettings", "reminderDue",
      "healthCheckReport", "healthCheckLoading", "runHealthCheck",
    ];
    for (const key of requiredIntegrityKeys) {
      expect(integrityKeys, `integrity slice missing: ${key}`).toContain(key);
    }
  });

  it("guardian: aggregation layer re-exports all 4 slice factories", () => {
    // Verify the aggregation module exports match direct imports (identity check)
    expect(createViewerStateSlice).toBe(createViewerStateSliceDirect);
    expect(createIntegrityStateSlice).toBe(createIntegrityStateSliceDirect);
    expect(createBatchStateSlice).toBe(createBatchStateSliceDirect);
    expect(createBatchActionSlice).toBe(createBatchActionSliceDirect);
  });

  it("public API: store exposes complete state shape with all expected keys", () => {
    const state = useKnowledgeStore.getState();
    const expectedKeys = [
      // core
      "documents", "isIngesting", "ingestProgress", "searchResults", "pinnedDocIds",
      "retrievalTopK", "setRetrievalTopK", "retrievalScope", "setRetrievalScope",
      "activePreset", "setPreset", "_activeDocPath", "_workspacePath", "settingsSource",
      "setWorkspacePath", "restoreForDocument", "saveAsWorkspaceDefault", "getScopeDocIds",
      "setIngestProgress", "loadDocuments", "ingestFile", "ingestText", "searchKB",
      "removeDocument", "togglePinDocument",
      // viewer
      "viewedChunk", "lastRequestedChunkId", "viewChunkLoading", "viewChunkError",
      "viewedChunkQuery", "viewedChunkScore", "viewChunk", "setViewChunkError",
      "closeChunkViewer", "dismissChunkError",
      // integrity
      "integrityReport", "integrityLoading", "integrityHistory", "integrityTrendHistory",
      "checkIntegrity", "relinkDocument", "removeStaleDocuments", "clearIntegrity",
      "loadIntegrityHistory", "reminderSettings", "reminderDue", "setReminderSettings",
      "snoozeReminder", "refreshReminderDue", "healthThresholds", "healthThresholdSource",
      "setHealthThresholds", "resetHealthThresholds", "getHealthThresholds",
      "saveThresholdsForWorkspace", "resetWorkspaceThresholds",
      "exportThresholdConfig", "importThresholdConfig",
      "healthCheckReport", "healthCheckLoading", "runHealthCheck",
      // batch
      "batchFixPlan", "batchLastPlan", "batchExecuting", "batchStepStatuses",
      "batchExecutionLog", "lastBatchImpact", "clearHealthCheck",
      "buildBatchPlan", "clearBatchPlan", "confirmBatchPlan", "retryBatchStep", "clearBatchLog",
    ];
    const stateKeys = Object.keys(state);
    for (const key of expectedKeys) {
      expect(stateKeys).toContain(key);
    }
  });
});
