import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  type HealthThresholdSettings,
  type ThresholdSource,
  DEFAULT_THRESHOLD_SETTINGS,
  clampThresholdSettings,
  loadThresholdSettings,
  removeWorkspaceThresholdSettings,
  resolveThresholdSettings,
  saveThresholdSettings,
  saveWorkspaceThresholdSettings,
  toHealthThresholds,
} from "../lib/integrity-health";
import {
  applyThresholdConfig,
  buildThresholdExportPayload,
  parseThresholdConfig,
  serializeThresholdConfig,
} from "../lib/integrity-threshold-io";
import {
  type IntegrityReminderSettings,
  computeSnoozeUntil,
  isReminderDue,
  loadReminderSettings,
  saveReminderSettings,
} from "../lib/integrity-reminder";
import { type HealthCheckReport, buildHealthCheckReport } from "../lib/integrity-healthcheck";
import {
  type BatchExecutionLog,
  type BatchFixPlan,
  type BatchExecutionCallbacks,
  type StepStatus,
  buildBatchFixPlan,
  executeBatchFixPlan,
  executeBatchStep,
  mergeRetriedResult,
} from "../lib/integrity-batch-plan";
import {
  type RetrievalPresetId,
  type RetrievalSettingsSource,
  RETRIEVAL_PRESETS,
  detectMatchingPreset,
  loadPresetFromStorage,
  resolveRetrievalSettings,
  saveDocRetrievalSettings,
  savePresetToStorage,
  saveWorkspaceRetrievalSettings,
} from "../lib/retrieval-presets";
import { type IntegrityTrendPoint, loadIntegrityTrendHistory, syncIntegrityTrendHistory } from "../lib/integrity-trend-history";
import {
  type BatchImpactSummary,
  buildBatchImpactSummary,
  loadBatchImpactSummary,
  saveBatchImpactSummary,
} from "../lib/integrity-batch-impact";
import { toast } from "./toast";

const inFlightBatchStepRetries = new Set<string>();

function buildViewChunkError(kind: ViewChunkErrorKind): ViewChunkErrorState {
  switch (kind) {
    case "source-missing":
      return {
        kind,
        message: "Source missing — this document is no longer in the knowledge base.",
      };
    case "malformed-link":
      return {
        kind,
        message: "Malformed citation link — this reference is invalid.",
      };
    case "chunk-missing":
    default:
      return {
        kind: "chunk-missing",
        message: "Chunk missing — this citation points to content that no longer exists.",
      };
  }
}

function classifyViewChunkError(err: unknown): ViewChunkErrorKind {
  const message = String(err instanceof Error ? err.message : err).toLowerCase();
  if (message.includes("malformed")) return "malformed-link";
  if (message.includes("source") && message.includes("missing")) return "source-missing";
  if (message.includes("query returned no rows") || message.includes("no rows")) {
    return "chunk-missing";
  }
  return "chunk-missing";
}

export interface KBDocument {
  id: number;
  title: string;
  sourceType: string;
  sourcePath: string | null;
  createdAt: string;
  chunkCount: number;
}

export interface SearchResult {
  chunkContent: string;
  documentTitle: string;
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  score: number;
}

export interface ChunkContext {
  chunkContent: string;
  documentTitle: string;
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  totalChunks: number;
  prevChunk: string | null;
  nextChunk: string | null;
}

export type ViewChunkErrorKind = "source-missing" | "chunk-missing" | "malformed-link";

export interface ViewChunkErrorState {
  kind: ViewChunkErrorKind;
  message: string;
}

export type RetrievalScope = "all" | "pinned";

export type IntegrityStatus = "healthy" | "missing" | "moved";

export interface IntegrityEntry {
  id: number;
  title: string;
  sourcePath: string;
  status: IntegrityStatus;
  movedCandidate: string | null;
}

export interface IntegrityReport {
  entries: IntegrityEntry[];
  healthy: number;
  missing: number;
  moved: number;
}

export interface IntegrityScanSnapshot {
  id: number;
  scannedAt: string;
  total: number;
  healthy: number;
  missing: number;
  moved: number;
  invalid?: number;
  notes: string | null;
}

interface KnowledgeState {
  documents: KBDocument[];
  isIngesting: boolean;
  ingestProgress: string;
  searchResults: SearchResult[];
  pinnedDocIds: Set<number>;

  /** Number of KB results to inject into AI prompts (1–10, default 5). */
  retrievalTopK: number;
  setRetrievalTopK: (topK: number) => void;

  /** Whether AI retrieval searches all docs or only pinned docs. */
  retrievalScope: RetrievalScope;
  setRetrievalScope: (scope: RetrievalScope) => void;

  /** Active retrieval preset (null = custom / manual settings). */
  activePreset: RetrievalPresetId | null;
  /** Apply a preset — updates topK + scope and persists the selection. */
  setPreset: (id: RetrievalPresetId) => void;

  /** File path whose retrieval settings are currently active (null = global/untitled). */
  _activeDocPath: string | null;
  /** Workspace path used for workspace-level retrieval defaults. */
  _workspacePath: string | null;
  /** Source that provided the current retrieval settings ("doc" | "workspace" | "global"). */
  settingsSource: RetrievalSettingsSource;
  /** Update the workspace path (called when workspace changes). */
  setWorkspacePath: (path: string | null) => void;
  /** Restore retrieval settings for a document (called on file switch). */
  restoreForDocument: (filePath: string | null) => void;
  /** Save current settings as workspace defaults. */
  saveAsWorkspaceDefault: () => void;

  /** Compute the scope_doc_ids to send to the backend based on current settings. */
  getScopeDocIds: () => number[] | undefined;

  /** Currently viewed source chunk (for source recall from citations). */
  viewedChunk: ChunkContext | null;
  lastRequestedChunkId: number | null;
  viewChunkLoading: boolean;
  viewChunkError: ViewChunkErrorState | null;

  /** Query text that led to this chunk being cited (for matched-term highlighting). */
  viewedChunkQuery: string | null;
  /** Relevance score of the viewed chunk (0–1). */
  viewedChunkScore: number | null;

  setIngestProgress: (msg: string) => void;
  loadDocuments: () => Promise<void>;
  ingestFile: (path: string) => Promise<void>;
  ingestText: (title: string, text: string) => Promise<void>;
  searchKB: (query: string, topK?: number) => Promise<SearchResult[]>;
  removeDocument: (id: number) => Promise<void>;
  togglePinDocument: (id: number) => void;

  /** Fetch and display a specific chunk for source recall. Optional query/score for highlighting. */
  viewChunk: (chunkId: number, query?: string, score?: number) => Promise<void>;
  setViewChunkError: (kind: ViewChunkErrorKind) => void;
  closeChunkViewer: () => void;
  dismissChunkError: () => void;

  /** KB integrity scan results. */
  integrityReport: IntegrityReport | null;
  integrityLoading: boolean;
  /** Recent integrity scan history snapshots. */
  integrityHistory: IntegrityScanSnapshot[];
  /** Local aggregated integrity trend history (workspace-scoped, persisted in localStorage). */
  integrityTrendHistory: IntegrityTrendPoint[];
  /** Run an integrity scan on all file-sourced documents. */
  checkIntegrity: () => Promise<void>;
  /** Relink a stale document to a new path. */
  relinkDocument: (id: number, newPath: string) => Promise<void>;
  /** Remove stale entries and refresh. */
  removeStaleDocuments: (ids: number[]) => Promise<void>;
  /** Clear the integrity report. */
  clearIntegrity: () => void;
  /** Load integrity scan history from backend. */
  loadIntegrityHistory: () => Promise<void>;

  /** Integrity scan reminder settings. */
  reminderSettings: IntegrityReminderSettings;
  /** Whether a scan reminder is currently due (derived). */
  reminderDue: boolean;
  /** Update reminder enabled/frequency and persist. */
  setReminderSettings: (patch: Partial<Pick<IntegrityReminderSettings, "enabled" | "frequency">>) => void;
  /** Snooze the current reminder for 24 hours. */
  snoozeReminder: () => void;
  /** Re-evaluate whether the reminder is due (call after scan or on mount). */
  refreshReminderDue: () => void;

  /** Health threshold settings (user-configurable). */
  healthThresholds: HealthThresholdSettings;
  /** Source of the active health thresholds ("global" or "workspace"). */
  healthThresholdSource: ThresholdSource;
  /** Update health thresholds (clamped + persisted to active source). */
  setHealthThresholds: (patch: Partial<HealthThresholdSettings>) => void;
  /** Reset health thresholds to global defaults. */
  resetHealthThresholds: () => void;
  /** Get internal HealthThresholds derived from current settings. */
  getHealthThresholds: () => ReturnType<typeof toHealthThresholds>;
  /** Save current thresholds as a workspace-specific override. */
  saveThresholdsForWorkspace: () => void;
  /** Remove workspace threshold override (fall back to global). */
  resetWorkspaceThresholds: () => void;

  /** Export threshold config to JSON string (for save-to-file). */
  exportThresholdConfig: () => string;
  /** Import threshold config from JSON string. Returns null on success, error string on failure. */
  importThresholdConfig: (jsonString: string) => string | null;

  /** Latest health check report (from one-click health check). */
  healthCheckReport: HealthCheckReport | null;
  /** Whether a health check is currently running. */
  healthCheckLoading: boolean;
  /** Run a full health check: scan + metrics + recommendations in one pass. */
  runHealthCheck: () => Promise<void>;
  /** Clear the health check report. */
  clearHealthCheck: () => void;

  /** Current batch fix plan (preview state, not yet executed). */
  batchFixPlan: BatchFixPlan | null;
  /** Keep last executed plan for per-step retries in current session. */
  batchLastPlan: BatchFixPlan | null;
  /** Whether batch execution is in progress. */
  batchExecuting: boolean;
  /** Runtime status for each batch step. */
  batchStepStatuses: Record<string, StepStatus>;
  /** Execution log from the last batch run (session-only). */
  batchExecutionLog: BatchExecutionLog | null;
  /** Latest persisted batch impact summary (workspace-scoped). */
  lastBatchImpact: BatchImpactSummary | null;
  /** Generate a batch fix plan from the current health check report. */
  buildBatchPlan: () => void;
  /** Clear the batch fix plan (cancel preview). */
  clearBatchPlan: () => void;
  /** Confirm and execute the current batch fix plan. */
  confirmBatchPlan: () => Promise<void>;
  /** Retry a failed step from the last execution. */
  retryBatchStep: (stepId: string) => Promise<void>;
  /** Clear the execution log. */
  clearBatchLog: () => void;
}

// Initialise from persisted preset (if any), falling back to defaults
const _initialPreset = loadPresetFromStorage();
const _initialConfig = _initialPreset ? RETRIEVAL_PRESETS[_initialPreset] : null;

/** Persist current retrieval settings both globally and per-document. */
function _persistSettings(state: {
  activePreset: RetrievalPresetId | null;
  retrievalTopK: number;
  retrievalScope: RetrievalScope;
  _activeDocPath: string | null;
}) {
  savePresetToStorage(state.activePreset);
  if (state._activeDocPath) {
    saveDocRetrievalSettings(state._activeDocPath, {
      preset: state.activePreset,
      topK: state.retrievalTopK,
      scope: state.retrievalScope,
    });
  }
}

/** Build the settings payload from current state. */
function _currentSettings(state: {
  activePreset: RetrievalPresetId | null;
  retrievalTopK: number;
  retrievalScope: RetrievalScope;
}) {
  return {
    preset: state.activePreset,
    topK: state.retrievalTopK,
    scope: state.retrievalScope,
  };
}

function _buildBatchCallbacks(
  integrityReport: IntegrityReport | null,
  setReminderSettings: KnowledgeState["setReminderSettings"],
): BatchExecutionCallbacks {
  const movedEntries = (integrityReport?.entries ?? [])
    .filter((e) => e.status === "moved")
    .map((e) => ({ id: e.id, movedCandidate: e.movedCandidate }));

  return {
    relinkDocument: async (id, newPath) => {
      await invoke("relink_kb_document", { id, newPath });
    },
    removeStaleDocuments: async (ids) => {
      for (const id of ids) {
        await invoke("remove_kb_document", { id });
      }
    },
    enableReminders: () => setReminderSettings({ enabled: true }),
    adjustFrequency: (freq) => setReminderSettings({ frequency: freq as "daily" | "every3days" | "weekly" }),
    movedEntries,
  };
}

// ===== Slice boundaries (for upcoming file split) =====
// viewer/*   -> createViewerStateSlice
// integrity/*-> createIntegrityStateSlice
// batch/*    -> createBatchStateSlice (+ root action wiring for now)
type ViewerStateSlice = Pick<KnowledgeState,
  "viewedChunk"
  | "lastRequestedChunkId"
  | "viewChunkLoading"
  | "viewChunkError"
  | "viewedChunkQuery"
  | "viewedChunkScore"
  | "viewChunk"
  | "setViewChunkError"
  | "closeChunkViewer"
  | "dismissChunkError"
>;

type IntegrityStateSlice = Pick<KnowledgeState,
  "integrityReport"
  | "integrityLoading"
  | "integrityHistory"
  | "integrityTrendHistory"
  | "checkIntegrity"
  | "relinkDocument"
  | "removeStaleDocuments"
  | "clearIntegrity"
  | "loadIntegrityHistory"
  | "reminderSettings"
  | "reminderDue"
  | "setReminderSettings"
  | "snoozeReminder"
  | "refreshReminderDue"
  | "healthThresholds"
  | "healthThresholdSource"
  | "setHealthThresholds"
  | "resetHealthThresholds"
  | "getHealthThresholds"
  | "saveThresholdsForWorkspace"
  | "resetWorkspaceThresholds"
  | "exportThresholdConfig"
  | "importThresholdConfig"
  | "healthCheckReport"
  | "healthCheckLoading"
  | "runHealthCheck"
>;

type BatchStateSlice = Pick<KnowledgeState,
  "batchFixPlan"
  | "batchLastPlan"
  | "batchExecuting"
  | "batchStepStatuses"
  | "batchExecutionLog"
  | "lastBatchImpact"
>;

export function createViewerStateSlice(
  set: (partial: Partial<KnowledgeState> | ((state: KnowledgeState) => Partial<KnowledgeState>)) => void,
): ViewerStateSlice {
  return {
    viewedChunk: null,
    lastRequestedChunkId: null,
    viewChunkLoading: false,
    viewChunkError: null,
    viewedChunkQuery: null,
    viewedChunkScore: null,
    viewChunk: async (chunkId, query, score) => {
      set({ viewChunkLoading: true, viewChunkError: null, lastRequestedChunkId: chunkId });
      try {
        const chunk = await invoke<ChunkContext>("get_kb_chunk", { chunkId });
        set({
          viewedChunk: chunk,
          viewChunkLoading: false,
          viewChunkError: null,
          ...(query !== undefined ? { viewedChunkQuery: query || null } : {}),
          ...(score !== undefined ? { viewedChunkScore: score } : {}),
        });
      } catch (err) {
        console.error("Failed to load chunk:", err);
        const kind = classifyViewChunkError(err);
        set({
          viewedChunk: null,
          viewChunkLoading: false,
          viewChunkError: buildViewChunkError(kind),
        });
      }
    },
    setViewChunkError: (kind) =>
      set({
        viewedChunk: null,
        viewChunkLoading: false,
        viewChunkError: buildViewChunkError(kind),
      }),
    closeChunkViewer: () =>
      set({
        viewedChunk: null,
        lastRequestedChunkId: null,
        viewChunkError: null,
        viewedChunkQuery: null,
        viewedChunkScore: null,
      }),
    dismissChunkError: () => set({ viewChunkError: null }),
  };
}

export function createIntegrityStateSlice(
  set: (partial: Partial<KnowledgeState> | ((state: KnowledgeState) => Partial<KnowledgeState>)) => void,
  get: () => KnowledgeState,
): IntegrityStateSlice {
  return {
    integrityReport: null,
    integrityLoading: false,
    integrityHistory: [],
    integrityTrendHistory: loadIntegrityTrendHistory(null),

    checkIntegrity: async () => {
      set({ integrityLoading: true });
      try {
        const report = await invoke<IntegrityReport>("check_kb_integrity");
        set({ integrityReport: report, integrityLoading: false });
        // Refresh history after scan (auto-saved by backend)
        await get().loadIntegrityHistory();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to check KB integrity:", message);
        toast.error(`Integrity check failed: ${message}`);
        set({ integrityLoading: false });
      }
    },

    relinkDocument: async (id, newPath) => {
      try {
        await invoke("relink_kb_document", { id, newPath });
        toast.success("Document relinked successfully");
        // Re-run integrity check and refresh document list
        await get().checkIntegrity();
        await get().loadDocuments();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to relink document:", message);
        toast.error(`Relink failed: ${message}`);
      }
    },

    removeStaleDocuments: async (ids) => {
      try {
        for (const id of ids) {
          await invoke("remove_kb_document", { id });
        }
        toast.success(`Removed ${ids.length} stale document${ids.length > 1 ? "s" : ""}`);
        await get().loadDocuments();
        await get().checkIntegrity();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to remove stale documents:", message);
        toast.error(`Remove failed: ${message}`);
      }
    },

    clearIntegrity: () => set({ integrityReport: null }),

    loadIntegrityHistory: async () => {
      try {
        const history = await invoke<IntegrityScanSnapshot[]>("get_integrity_history");
        const safeHistory = Array.isArray(history) ? history : [];
        const trendHistory = syncIntegrityTrendHistory(get()._workspacePath, safeHistory);
        set({ integrityHistory: safeHistory, integrityTrendHistory: trendHistory });
        // Re-evaluate reminder whenever history changes
        const state = get();
        const lastScanAt = safeHistory.length > 0 ? safeHistory[0].scannedAt : null;
        set({ reminderDue: isReminderDue(state.reminderSettings, lastScanAt) });
      } catch (err) {
        console.error("Failed to load integrity history:", err);
      }
    },

    reminderSettings: loadReminderSettings(),
    reminderDue: false,

    setReminderSettings: (patch) => {
      const current = get().reminderSettings;
      const updated: IntegrityReminderSettings = {
        ...current,
        ...patch,
        // Clear snooze when toggling enabled or changing frequency
        snoozedUntil: null,
      };
      saveReminderSettings(updated);
      const lastScanAt = get().integrityHistory[0]?.scannedAt ?? null;
      set({
        reminderSettings: updated,
        reminderDue: isReminderDue(updated, lastScanAt),
      });
    },

    snoozeReminder: () => {
      const current = get().reminderSettings;
      const updated: IntegrityReminderSettings = {
        ...current,
        snoozedUntil: computeSnoozeUntil(),
      };
      saveReminderSettings(updated);
      set({ reminderSettings: updated, reminderDue: false });
    },

    refreshReminderDue: () => {
      const { reminderSettings, integrityHistory } = get();
      const lastScanAt = integrityHistory[0]?.scannedAt ?? null;
      set({ reminderDue: isReminderDue(reminderSettings, lastScanAt) });
    },

    healthThresholds: loadThresholdSettings(),
    healthThresholdSource: "global" as ThresholdSource,

    setHealthThresholds: (patch) => {
      const current = get().healthThresholds;
      const updated = clampThresholdSettings({ ...current, ...patch });
      const { _workspacePath, healthThresholdSource } = get();
      // Persist to the active source layer
      if (healthThresholdSource === "workspace" && _workspacePath) {
        saveWorkspaceThresholdSettings(_workspacePath, updated);
      } else {
        saveThresholdSettings(updated);
      }
      set({ healthThresholds: updated });
    },

    resetHealthThresholds: () => {
      const defaults = { ...DEFAULT_THRESHOLD_SETTINGS };
      saveThresholdSettings(defaults);
      // Also clear workspace override if active
      const { _workspacePath } = get();
      if (_workspacePath) {
        removeWorkspaceThresholdSettings(_workspacePath);
      }
      set({ healthThresholds: defaults, healthThresholdSource: "global" });
    },

    getHealthThresholds: () => toHealthThresholds(get().healthThresholds),

    saveThresholdsForWorkspace: () => {
      const { _workspacePath, healthThresholds } = get();
      if (!_workspacePath) return;
      saveWorkspaceThresholdSettings(_workspacePath, healthThresholds);
      set({ healthThresholdSource: "workspace" });
    },

    resetWorkspaceThresholds: () => {
      const { _workspacePath } = get();
      if (!_workspacePath) return;
      removeWorkspaceThresholdSettings(_workspacePath);
      // Fall back to global
      const globalSettings = loadThresholdSettings();
      set({ healthThresholds: globalSettings, healthThresholdSource: "global" });
    },

    exportThresholdConfig: () => {
      const payload = buildThresholdExportPayload();
      return serializeThresholdConfig(payload);
    },

    importThresholdConfig: (jsonString) => {
      const result = parseThresholdConfig(jsonString);
      if (!result.ok) return result.error;
      applyThresholdConfig(result.payload);
      // Re-resolve for current workspace
      const { _workspacePath } = get();
      const { settings, source } = resolveThresholdSettings(_workspacePath);
      set({ healthThresholds: settings, healthThresholdSource: source });
      return null;
    },

    healthCheckReport: null,
    healthCheckLoading: false,

    runHealthCheck: async () => {
      set({ healthCheckLoading: true, healthCheckReport: null });
      try {
        // 1. Run integrity scan (persists snapshot + refreshes history)
        const report = await invoke<IntegrityReport>("check_kb_integrity");
        set({ integrityReport: report, integrityLoading: false });

        // 2. Refresh history (auto-saved by backend)
        const history = await invoke<IntegrityScanSnapshot[]>("get_integrity_history");
        const safeHistory = Array.isArray(history) ? history : [];
        const trendHistory = syncIntegrityTrendHistory(get()._workspacePath, safeHistory);
        set({ integrityHistory: safeHistory, integrityTrendHistory: trendHistory });

        // Re-evaluate reminder
        const lastScanAt = safeHistory.length > 0 ? safeHistory[0].scannedAt : null;
        set({ reminderDue: isReminderDue(get().reminderSettings, lastScanAt) });

        // 3. Build health check report
        const { healthThresholds, reminderSettings } = get();
        const hcReport = buildHealthCheckReport(
          report,
          safeHistory,
          healthThresholds,
          reminderSettings,
        );

        set({ healthCheckReport: hcReport, healthCheckLoading: false });
        toast.success("Health check complete");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Health check failed:", message);
        toast.error(`Health check failed: ${message}`);
        set({ healthCheckLoading: false });
      }
    },
  };
}

export function createBatchStateSlice(): BatchStateSlice {
  return {
    batchFixPlan: null,
    batchLastPlan: null,
    batchExecuting: false,
    batchStepStatuses: {},
    batchExecutionLog: null,
    lastBatchImpact: loadBatchImpactSummary(null),
  };
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  documents: [],
  isIngesting: false,
  ingestProgress: "",
  searchResults: [],
  pinnedDocIds: new Set(),
  retrievalTopK: _initialConfig?.topK ?? 5,
  retrievalScope: (_initialConfig?.scope ?? "all") as RetrievalScope,
  activePreset: _initialPreset,
  _activeDocPath: null,
  _workspacePath: null,
  settingsSource: "global" as RetrievalSettingsSource,
  ...createViewerStateSlice(set),
  ...createIntegrityStateSlice(set, get),
  ...createBatchStateSlice(),

  setRetrievalTopK: (topK) => {
    const clamped = Math.max(1, Math.min(10, topK));
    const newPreset = detectMatchingPreset(clamped, get().retrievalScope);
    const source = get()._activeDocPath ? "doc" as RetrievalSettingsSource : get().settingsSource;
    set({ retrievalTopK: clamped, activePreset: newPreset, settingsSource: source });
    _persistSettings(get());
  },
  setRetrievalScope: (scope) => {
    const newPreset = detectMatchingPreset(get().retrievalTopK, scope);
    const source = get()._activeDocPath ? "doc" as RetrievalSettingsSource : get().settingsSource;
    set({ retrievalScope: scope, activePreset: newPreset, settingsSource: source });
    _persistSettings(get());
  },

  setPreset: (id) => {
    const preset = RETRIEVAL_PRESETS[id];
    const source = get()._activeDocPath ? "doc" as RetrievalSettingsSource : get().settingsSource;
    set({ activePreset: id, retrievalTopK: preset.topK, retrievalScope: preset.scope, settingsSource: source });
    _persistSettings(get());
  },

  setWorkspacePath: (path) => {
    set({
      _workspacePath: path,
      integrityTrendHistory: loadIntegrityTrendHistory(path),
      lastBatchImpact: loadBatchImpactSummary(path),
    });
    // Re-resolve health thresholds for new workspace
    const { settings, source } = resolveThresholdSettings(path);
    set({ healthThresholds: settings, healthThresholdSource: source });
  },

  restoreForDocument: (filePath) => {
    const workspacePath = get()._workspacePath;
    const { settings, source } = resolveRetrievalSettings(filePath, workspacePath);
    set({
      _activeDocPath: filePath,
      activePreset: settings.preset,
      retrievalTopK: settings.topK,
      retrievalScope: settings.scope as RetrievalScope,
      settingsSource: source,
    });
  },

  saveAsWorkspaceDefault: () => {
    const { _workspacePath } = get();
    if (!_workspacePath) return;
    saveWorkspaceRetrievalSettings(_workspacePath, _currentSettings(get()));
  },

  getScopeDocIds: () => {
    const { retrievalScope, pinnedDocIds } = get();
    if (retrievalScope === "pinned" && pinnedDocIds.size > 0) {
      return Array.from(pinnedDocIds);
    }
    return undefined;
  },

  setIngestProgress: (msg) => set({ ingestProgress: msg }),

  loadDocuments: async () => {
    try {
      const docs = await invoke<KBDocument[]>("list_kb_documents");
      set({ documents: docs });
    } catch (err) {
      console.error("Failed to load KB documents:", err);
    }
  },

  ingestFile: async (path) => {
    set({ isIngesting: true, ingestProgress: "Reading file..." });
    try {
      await invoke("ingest_file", { path });
      await get().loadDocuments();
      toast.success("Document added to knowledge base");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to ingest file:", message);
      toast.error(message);
    } finally {
      set({ isIngesting: false, ingestProgress: "" });
    }
  },

  ingestText: async (title, text) => {
    set({ isIngesting: true, ingestProgress: "Processing text..." });
    try {
      await invoke("ingest_text", { title, text });
      await get().loadDocuments();
      toast.success("Text added to knowledge base");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to ingest text:", message);
      toast.error(message);
    } finally {
      set({ isIngesting: false, ingestProgress: "" });
    }
  },

  searchKB: async (query, topK = 5) => {
    try {
      const results = await invoke<SearchResult[]>("search_knowledge_base", {
        query,
        topK,
      });
      set({ searchResults: results });
      return results;
    } catch (err) {
      console.error("Failed to search KB:", err);
      return [];
    }
  },

  removeDocument: async (id) => {
    try {
      await invoke("remove_kb_document", { id });
      await get().loadDocuments();
    } catch (err) {
      console.error("Failed to remove document:", err);
    }
  },

  togglePinDocument: (id) => {
    set((state) => {
      const newPinned = new Set(state.pinnedDocIds);
      if (newPinned.has(id)) {
        newPinned.delete(id);
      } else {
        newPinned.add(id);
      }
      return { pinnedDocIds: newPinned };
    });
  },

  // ===== Compatibility boundary (next split targets) =====
  // viewer/* actions live in createViewerStateSlice
  // integrity/* actions live in createIntegrityStateSlice
  // batch/* actions remain in root store for now (next extraction: createBatchActionSlice)

  clearHealthCheck: () =>
    set({ healthCheckReport: null, batchFixPlan: null, batchLastPlan: null, batchExecutionLog: null, batchStepStatuses: {} }),

  buildBatchPlan: () => {
    const { healthCheckReport } = get();
    if (!healthCheckReport) return;
    const plan = buildBatchFixPlan(healthCheckReport);
    set({ batchFixPlan: plan, batchExecutionLog: null, batchStepStatuses: {} });
  },

  clearBatchPlan: () => set({ batchFixPlan: null }),

  confirmBatchPlan: async () => {
    const { batchFixPlan, integrityReport, setReminderSettings } = get();
    if (!batchFixPlan) return;

    const statuses: Record<string, StepStatus> = {};
    for (const step of batchFixPlan.steps) statuses[step.stepId] = "pending";

    set({ batchExecuting: true, batchStepStatuses: statuses });
    try {
      const callbacks = _buildBatchCallbacks(integrityReport, setReminderSettings);
      const log = await executeBatchFixPlan(batchFixPlan, callbacks, {
        onStepStatusChange: (stepId, status) => {
          set((state) => ({ batchStepStatuses: { ...state.batchStepStatuses, [stepId]: status } }));
        },
      });

      const summary = buildBatchImpactSummary(log);
      saveBatchImpactSummary(get()._workspacePath, summary);
      set({
        batchExecutionLog: log,
        batchLastPlan: batchFixPlan,
        batchFixPlan: null,
        batchExecuting: false,
        lastBatchImpact: summary,
      });

      const { success, failed, skipped, itemChanges } = log.summary;
      if (failed > 0) {
        toast.error(`Batch: ${success} ok, ${failed} failed, ${skipped} skipped · ${itemChanges.success} items changed`);
      } else {
        toast.success(`Batch complete: ${success} applied, ${skipped} skipped · ${itemChanges.success} items changed`);
      }

      await get().loadDocuments();
      await get().checkIntegrity();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Batch execution failed: ${message}`);
      set({ batchExecuting: false });
    }
  },

  retryBatchStep: async (stepId: string) => {
    const { batchExecutionLog, batchLastPlan, integrityReport, setReminderSettings } = get();
    if (!batchExecutionLog || !batchLastPlan || inFlightBatchStepRetries.has(stepId)) return;

    const previous = batchExecutionLog.results.find((r) => r.stepId === stepId);
    const step = batchLastPlan.steps.find((s) => s.stepId === stepId);
    if (!previous || !step || previous.outcome !== "failed") return;

    inFlightBatchStepRetries.add(stepId);
    try {
      const callbacks = _buildBatchCallbacks(integrityReport, setReminderSettings);
      const retried = await executeBatchStep(step, callbacks, {
        onStepStatusChange: (id, status) => {
          set((state) => ({ batchStepStatuses: { ...state.batchStepStatuses, [id]: status } }));
        },
      }, previous.attempts + 1);

      const merged = mergeRetriedResult(batchExecutionLog, retried);
      const summary = buildBatchImpactSummary(merged);
      saveBatchImpactSummary(get()._workspacePath, summary);
      set({ batchExecutionLog: merged, lastBatchImpact: summary });

      if (retried.outcome === "success") {
        toast.success(`Retried ${stepId.replace("step-", "")}: success`);
        await get().loadDocuments();
        await get().checkIntegrity();
      } else {
        toast.error(`Retried ${stepId.replace("step-", "")}: ${retried.message}`);
      }
    } finally {
      inFlightBatchStepRetries.delete(stepId);
    }
  },

  clearBatchLog: () => set({ batchExecutionLog: null, batchStepStatuses: {} }),
}));
