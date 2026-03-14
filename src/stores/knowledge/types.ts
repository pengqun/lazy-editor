import type { HealthThresholdSettings, ThresholdSource } from "../../lib/integrity-health";
import { toHealthThresholds } from "../../lib/integrity-health";
import type { IntegrityReminderSettings } from "../../lib/integrity-reminder";
import type { HealthCheckReport } from "../../lib/integrity-healthcheck";
import type { BatchExecutionLog, BatchFixPlan, StepStatus } from "../../lib/integrity-batch-plan";
import type { RetrievalPresetId, RetrievalSettingsSource } from "../../lib/retrieval-presets";
import type { IntegrityTrendPoint } from "../../lib/integrity-trend-history";
import type { BatchImpactSummary } from "../../lib/integrity-batch-impact";

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

export interface KnowledgeState {
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

  /** Fetch and display a specific chunk for source recall. Optional query/score for highlighting, documentId for backend source-existence check. */
  viewChunk: (chunkId: number, query?: string, score?: number, documentId?: number) => Promise<void>;
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
