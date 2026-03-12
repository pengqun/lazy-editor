import {
  Activity,
  AlertCircle,
  Bell,
  BellOff,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Clock,
  Download,
  FilePlus2,
  HeartPulse,
  Link2,
  Loader2,
  Pin,
  PinOff,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { buildExportPayload, computeTrend, formatDelta, formatJSON, formatMarkdown } from "../../lib/integrity-export";
import { type HealthThresholdSettings, type ThresholdSource, DEFAULT_THRESHOLD_SETTINGS, TIER_BG_COLORS, TIER_COLORS, TIER_LABELS, computeHealthTier, computeScanCoverage, formatAge, toHealthThresholds } from "../../lib/integrity-health";
import { FREQUENCY_IDS, FREQUENCY_LABELS, type ReminderFrequency } from "../../lib/integrity-reminder";
import type { HealthCheckReport, RecommendationAction } from "../../lib/integrity-healthcheck";
import { type HighlightSegment, findMatchedTerms, highlightText } from "../../lib/kb-highlight";
import { PRESET_IDS, RETRIEVAL_PRESETS, type RetrievalSettingsSource } from "../../lib/retrieval-presets";
import { listenToIngestProgress, openFileDialog } from "../../lib/tauri";
import { useFilesStore } from "../../stores/files";
import { type IntegrityEntry, type IntegrityReport, type IntegrityScanSnapshot, type RetrievalScope, useKnowledgeStore } from "../../stores/knowledge";

export function KnowledgePanel() {
  const {
    documents,
    loadDocuments,
    ingestFile,
    ingestText,
    searchKB,
    searchResults,
    removeDocument,
    isIngesting,
    ingestProgress,
    setIngestProgress,
    pinnedDocIds,
    togglePinDocument,
    retrievalTopK,
    setRetrievalTopK,
    retrievalScope,
    setRetrievalScope,
    activePreset,
    setPreset,
    settingsSource,
    saveAsWorkspaceDefault,
    _workspacePath,
    viewedChunk,
    viewChunkLoading,
    viewChunkError,
    viewChunk,
    integrityReport,
    integrityLoading,
    integrityHistory,
    checkIntegrity,
    relinkDocument,
    removeStaleDocuments,
    clearIntegrity,
    loadIntegrityHistory,
    reminderSettings,
    reminderDue,
    setReminderSettings,
    snoozeReminder,
    refreshReminderDue,
    healthCheckReport,
    healthCheckLoading,
    runHealthCheck,
    clearHealthCheck,
  } = useKnowledgeStore();

  const activeFilePath = useFilesStore((s) => s.activeFilePath);

  const [searchQuery, setSearchQuery] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [showRetrievalSettings, setShowRetrievalSettings] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  useEffect(() => {
    loadDocuments();
    loadIntegrityHistory().then(() => refreshReminderDue());
  }, [loadDocuments, loadIntegrityHistory, refreshReminderDue]);

  useEffect(() => {
    const unlisten = listenToIngestProgress((msg) => {
      setIngestProgress(msg);
    });
    return () => unlisten();
  }, [setIngestProgress]);

  const handleIngestFile = async () => {
    const path = await openFileDialog();
    if (path) {
      await ingestFile(path);
    }
  };

  const handleIngestText = async () => {
    if (!textTitle.trim() || !textContent.trim()) return;
    await ingestText(textTitle, textContent);
    setTextTitle("");
    setTextContent("");
    setShowTextInput(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    await searchKB(searchQuery);
  };

  const showEmptyState = documents.length === 0 && searchResults.length === 0;

  // If viewing a chunk, show the source viewer overlay
  if (viewedChunk || viewChunkLoading || viewChunkError) {
    return <ChunkViewer />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-accent" />
          <span className="text-sm font-medium text-text-secondary">Knowledge Base</span>
        </div>
        <div className="flex items-center gap-1">
          {activePreset && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium cursor-pointer"
              onClick={() => setShowRetrievalSettings(true)}
              title={`Preset: ${RETRIEVAL_PRESETS[activePreset].label} — ${RETRIEVAL_PRESETS[activePreset].description}`}
            >
              {RETRIEVAL_PRESETS[activePreset].label}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowRetrievalSettings(!showRetrievalSettings)}
            className={cn(
              "p-1 rounded transition-colors",
              showRetrievalSettings
                ? "bg-accent/20 text-accent"
                : "hover:bg-surface-3 text-text-tertiary",
            )}
            title="Retrieval settings"
          >
            <Settings2 size={14} />
          </button>
          <button
            type="button"
            onClick={checkIntegrity}
            disabled={integrityLoading}
            className={cn(
              "p-1 rounded transition-colors relative",
              integrityReport
                ? "bg-accent/20 text-accent"
                : "hover:bg-surface-3 text-text-tertiary",
            )}
            title="Check KB source integrity"
          >
            {integrityLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ShieldCheck size={14} />
            )}
            {reminderDue && !integrityReport && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            type="button"
            onClick={runHealthCheck}
            disabled={healthCheckLoading}
            className={cn(
              "p-1 rounded transition-colors",
              healthCheckReport
                ? "bg-accent/20 text-accent"
                : "hover:bg-surface-3 text-text-tertiary",
            )}
            title="Run full health check (scan + recommendations)"
          >
            {healthCheckLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <HeartPulse size={14} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowTextInput(!showTextInput)}
            className="p-1 hover:bg-surface-3 rounded transition-colors"
            title="Paste text to KB"
          >
            <ClipboardPaste size={14} className="text-text-tertiary" />
          </button>
          <button
            type="button"
            onClick={handleIngestFile}
            className="p-1 hover:bg-surface-3 rounded transition-colors"
            title="Add document to KB"
          >
            <Upload size={14} className="text-text-tertiary" />
          </button>
        </div>
      </div>

      {/* Retrieval Settings */}
      {showRetrievalSettings && (
        <div className="p-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-tertiary uppercase tracking-wider">
                Retrieval Settings
              </span>
              <SettingsSourceBadge source={settingsSource} />
              {activeFilePath && (
                <span className="text-[10px] text-text-tertiary truncate max-w-[100px]" title={activeFilePath}>
                  — {activeFilePath.split("/").pop()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowRetrievalSettings(false)}
              className="p-0.5 hover:bg-surface-3 rounded"
            >
              <X size={12} className="text-text-tertiary" />
            </button>
          </div>

          {/* Preset switcher */}
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Preset</label>
            <div className="flex gap-1">
              {PRESET_IDS.map((id) => {
                const preset = RETRIEVAL_PRESETS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreset(id)}
                    className={cn(
                      "flex-1 text-xs px-2 py-1 rounded border transition-colors",
                      activePreset === id
                        ? "bg-accent/20 border-accent text-accent"
                        : "bg-surface-2 border-border text-text-tertiary hover:bg-surface-3",
                    )}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            {!activePreset && (
              <p className="text-[10px] text-text-tertiary">Custom settings active</p>
            )}
          </div>

          {/* Top-K control */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-secondary">Results per query</label>
              <span className="text-xs text-accent font-medium tabular-nums">{retrievalTopK}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={retrievalTopK}
              onChange={(e) => setRetrievalTopK(Number(e.target.value))}
              className="w-full h-1 bg-surface-3 rounded-full appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between text-[10px] text-text-tertiary">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          {/* Scope control */}
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Document scope</label>
            <div className="flex gap-1">
              {(["all", "pinned"] as RetrievalScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setRetrievalScope(scope)}
                  className={cn(
                    "flex-1 text-xs px-2 py-1 rounded border transition-colors",
                    retrievalScope === scope
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-surface-2 border-border text-text-tertiary hover:bg-surface-3",
                  )}
                >
                  {scope === "all" ? "All docs" : "Pinned only"}
                </button>
              ))}
            </div>
            {retrievalScope === "pinned" && pinnedDocIds.size === 0 && (
              <p className="text-[10px] text-amber-400">
                No documents pinned — AI will search all docs as fallback.
              </p>
            )}
          </div>

          {/* Save as workspace default */}
          {_workspacePath && (
            <button
              type="button"
              onClick={saveAsWorkspaceDefault}
              className="w-full text-[11px] px-2 py-1 rounded border border-border text-text-tertiary hover:bg-surface-3 hover:text-text-secondary transition-colors"
              title="Save current settings as the default for this workspace"
            >
              Save as workspace default
            </button>
          )}
        </div>
      )}

      {/* Text Input Form */}
      {showTextInput && (
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">Paste Text</span>
            <button
              type="button"
              onClick={() => setShowTextInput(false)}
              className="p-0.5 hover:bg-surface-3 rounded"
            >
              <X size={12} className="text-text-tertiary" />
            </button>
          </div>
          <input
            type="text"
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Title..."
            className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
          />
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Paste text content here..."
            rows={4}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent resize-none"
          />
          <button
            type="button"
            onClick={handleIngestText}
            disabled={!textTitle.trim() || !textContent.trim()}
            className="w-full text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add to Knowledge Base
          </button>
        </div>
      )}

      {/* Integrity Reminder Banner */}
      {reminderDue && !integrityReport && (
        <div className="px-3 py-2 border-b border-border bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Bell size={12} className="text-amber-400" />
            <span className="text-xs text-amber-400 font-medium">Integrity scan due</span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={checkIntegrity}
              disabled={integrityLoading}
              className="flex-1 text-[11px] px-2 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              Scan now
            </button>
            <button
              type="button"
              onClick={snoozeReminder}
              className="text-[11px] px-2 py-1 rounded border border-border text-text-tertiary hover:bg-surface-3 transition-colors"
              title="Snooze for 24 hours"
            >
              <Clock size={11} className="inline mr-0.5 -mt-px" />
              Snooze
            </button>
          </div>
        </div>
      )}

      {/* Health Check Result Card */}
      {healthCheckReport && (
        <HealthCheckCard
          report={healthCheckReport}
          integrityReport={integrityReport}
          integrityHistory={integrityHistory}
          onRelink={relinkDocument}
          onRemoveStale={removeStaleDocuments}
          onEnableReminders={() => setReminderSettings({ enabled: true })}
          onAdjustFrequency={(freq) => setReminderSettings({ frequency: freq })}
          onClose={clearHealthCheck}
        />
      )}

      {/* Integrity Report */}
      {integrityReport && !healthCheckReport && (
        <IntegritySection
          report={integrityReport}
          history={integrityHistory}
          onRelink={relinkDocument}
          onRemove={removeStaleDocuments}
          onClose={clearIntegrity}
          reminderSettings={reminderSettings}
          onReminderChange={setReminderSettings}
          healthThresholds={useKnowledgeStore.getState().healthThresholds}
          healthThresholdSource={useKnowledgeStore.getState().healthThresholdSource}
          hasWorkspace={!!useKnowledgeStore.getState()._workspacePath}
          onThresholdsChange={useKnowledgeStore.getState().setHealthThresholds}
          onThresholdsReset={useKnowledgeStore.getState().resetHealthThresholds}
          onSaveForWorkspace={useKnowledgeStore.getState().saveThresholdsForWorkspace}
          onResetWorkspace={useKnowledgeStore.getState().resetWorkspaceThresholds}
          onExportThresholds={useKnowledgeStore.getState().exportThresholdConfig}
          onImportThresholds={useKnowledgeStore.getState().importThresholdConfig}
        />
      )}

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search knowledge base..."
            className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="p-1 bg-surface-2 border border-border rounded hover:bg-surface-3 transition-colors"
          >
            <Search size={14} className="text-text-tertiary" />
          </button>
        </div>
      </div>

      {/* Ingestion Progress */}
      {isIngesting && (
        <div className="px-3 py-2 border-b border-border bg-accent/5">
          <div className="flex items-center gap-2 text-xs text-accent">
            <Loader2 size={12} className="animate-spin" />
            {ingestProgress || "Processing..."}
          </div>
        </div>
      )}

      {/* Empty State */}
      {showEmptyState && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-lg border border-dashed border-border bg-surface-1/50 p-4 text-center">
            <div className="mx-auto mb-2 w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center">
              <FilePlus2 size={16} className="text-accent" />
            </div>
            <p className="text-sm text-text-primary font-medium">Your knowledge base is empty</p>
            <p className="text-xs text-text-tertiary mt-1">
              Add your first document so AI can use it for research and drafting.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleIngestFile}
                className="w-full text-xs px-2 py-1.5 rounded bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                Import first document
              </button>
              <button
                type="button"
                onClick={() => setShowTextInput(true)}
                className="w-full text-xs px-2 py-1.5 rounded border border-border hover:bg-surface-2 transition-colors text-text-secondary"
              >
                Paste quick notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border-b border-border">
          <div className="px-3 py-2">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Search Results
            </span>
          </div>
          {searchResults.map((result) => {
            const segments = highlightText(result.chunkContent, searchQuery);
            const matched = findMatchedTerms(searchQuery, result.chunkContent);
            return (
              <button
                type="button"
                key={`${result.chunkId}-${result.score}`}
                onClick={() => viewChunk(result.chunkId)}
                className="w-full text-left px-3 py-2 border-t border-border/50 hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-accent truncate">
                    {result.documentTitle}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-text-secondary line-clamp-3">
                  <HighlightedText segments={segments} />
                </p>
                {matched.length > 0 && (
                  <p className="text-xs text-text-tertiary mt-1 truncate">
                    <span className="text-accent/70">Why:</span> {matched.slice(0, 5).join(", ")}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Documents List */}
      {!showEmptyState && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Documents ({documents.length})
            </span>
          </div>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="px-3 py-2 border-t border-border/50 hover:bg-surface-2 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-primary truncate flex-1">
                  {doc.title}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => togglePinDocument(doc.id)}
                    className="p-0.5 hover:bg-surface-3 rounded"
                    title={pinnedDocIds.has(doc.id) ? "Unpin" : "Pin for AI context"}
                  >
                    {pinnedDocIds.has(doc.id) ? (
                      <PinOff size={12} className="text-accent" />
                    ) : (
                      <Pin size={12} className="text-text-tertiary" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDocument(doc.id)}
                    className="p-0.5 hover:bg-surface-3 rounded"
                    title="Remove from KB"
                  >
                    <Trash2 size={12} className="text-text-tertiary hover:text-red-400" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    pinnedDocIds.has(doc.id)
                      ? "bg-accent/20 text-accent"
                      : "bg-surface-3 text-text-tertiary",
                  )}
                >
                  {doc.sourceType}
                </span>
                <span className="text-xs text-text-tertiary">{doc.chunkCount} chunks</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Source chunk viewer — shows full chunk content with prev/next navigation and matched-term highlighting. */
function ChunkViewer() {
  const {
    viewedChunk,
    viewChunkLoading,
    viewChunkError,
    viewChunk,
    closeChunkViewer,
    dismissChunkError,
    viewedChunkQuery,
    viewedChunkScore,
  } = useKnowledgeStore();

  if (viewChunkLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 size={16} className="text-accent animate-spin" />
        <span className="text-xs text-text-tertiary mt-2">Loading source...</span>
      </div>
    );
  }

  if (viewChunkError) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-10 flex items-center gap-2 px-3 border-b border-border">
          <span className="text-xs font-medium text-text-secondary truncate flex-1">
            Source Viewer
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface-1 p-4 text-center">
            <div className="mx-auto mb-2 w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
              <AlertCircle size={16} className="text-amber-400" />
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">{viewChunkError}</p>
            <button
              type="button"
              onClick={dismissChunkError}
              className="mt-3 text-xs px-2.5 py-1 rounded border border-border text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!viewedChunk) return null;

  const { chunkContent, documentTitle, chunkIndex, totalChunks, prevChunk, nextChunk, chunkId } =
    viewedChunk;

  // Compute highlighted segments if a query led to this chunk
  const contentSegments = viewedChunkQuery
    ? highlightText(chunkContent, viewedChunkQuery)
    : null;
  const matchedTerms = viewedChunkQuery
    ? findMatchedTerms(viewedChunkQuery, chunkContent)
    : [];

  // Navigate to an adjacent chunk by computing its expected chunk_id offset
  // This is a heuristic; we use the current chunk_id +/- 1 as adjacent chunks
  // are typically sequential IDs. The backend get_chunk_with_context handles the lookup.
  const handleNav = (direction: -1 | 1) => {
    viewChunk(chunkId + direction);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-10 flex items-center gap-2 px-3 border-b border-border">
        <button
          type="button"
          onClick={closeChunkViewer}
          className="p-1 hover:bg-surface-3 rounded transition-colors"
          title="Back to Knowledge Base"
        >
          <ChevronLeft size={14} className="text-text-tertiary" />
        </button>
        <span className="text-xs font-medium text-accent truncate flex-1" title={documentTitle}>
          {documentTitle}
        </span>
        <div className="flex items-center gap-1.5">
          {viewedChunkScore != null && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium tabular-nums"
              title={`${(viewedChunkScore * 100).toFixed(1)}% relevance score`}
            >
              {Math.round(viewedChunkScore * 100)}%
            </span>
          )}
          <span className="text-[10px] text-text-tertiary whitespace-nowrap tabular-nums">
            {chunkIndex + 1}/{totalChunks}
          </span>
        </div>
      </div>

      {/* Matched terms bar */}
      {matchedTerms.length > 0 && (
        <div className="px-3 py-1.5 border-b border-border/50 bg-accent/5">
          <p className="text-[10px] text-text-tertiary truncate">
            <span className="text-accent/70 font-medium">Matched:</span>{" "}
            {matchedTerms.slice(0, 6).join(", ")}
          </p>
        </div>
      )}

      {/* Chunk content */}
      <div className="flex-1 overflow-y-auto">
        {/* Previous chunk (faded context) */}
        {prevChunk && (
          <div className="px-3 py-2 border-b border-border/30">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Previous chunk
            </span>
            <p className="text-xs text-text-tertiary mt-1 line-clamp-4 whitespace-pre-wrap">
              {prevChunk}
            </p>
          </div>
        )}

        {/* Current chunk (highlighted) */}
        <div className="px-3 py-3 bg-accent/5 border-l-2 border-accent">
          <p className="text-xs text-text-primary whitespace-pre-wrap leading-relaxed">
            {contentSegments ? (
              <HighlightedText segments={contentSegments} />
            ) : (
              chunkContent
            )}
          </p>
        </div>

        {/* Next chunk (faded context) */}
        {nextChunk && (
          <div className="px-3 py-2 border-t border-border/30">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Next chunk
            </span>
            <p className="text-xs text-text-tertiary mt-1 line-clamp-4 whitespace-pre-wrap">
              {nextChunk}
            </p>
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="h-8 flex items-center justify-between px-3 border-t border-border">
        <button
          type="button"
          onClick={() => handleNav(-1)}
          disabled={chunkIndex === 0}
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={12} />
          Prev
        </button>
        <button
          type="button"
          onClick={() => handleNav(1)}
          disabled={chunkIndex >= totalChunks - 1}
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          Next
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

const SOURCE_BADGE_STYLES: Record<RetrievalSettingsSource, string> = {
  doc: "bg-blue-500/15 text-blue-400",
  workspace: "bg-emerald-500/15 text-emerald-400",
  global: "bg-surface-3 text-text-tertiary",
};

const SOURCE_BADGE_LABELS: Record<RetrievalSettingsSource, string> = {
  doc: "doc",
  workspace: "workspace",
  global: "global",
};

const SOURCE_BADGE_TITLES: Record<RetrievalSettingsSource, string> = {
  doc: "Settings saved for this document",
  workspace: "Using workspace default settings",
  global: "Using global default settings",
};

function SettingsSourceBadge({ source }: { source: RetrievalSettingsSource }) {
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-medium",
        SOURCE_BADGE_STYLES[source],
      )}
      title={SOURCE_BADGE_TITLES[source]}
    >
      {SOURCE_BADGE_LABELS[source]}
    </span>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-blue-400",
  info: "text-emerald-400",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "H",
  medium: "M",
  low: "L",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400 border-emerald-400/30",
  medium: "text-amber-400 border-amber-400/30",
  low: "text-text-tertiary border-border",
};

function HealthCheckCard({
  report: hcReport,
  integrityReport,
  integrityHistory,
  onRelink,
  onRemoveStale,
  onEnableReminders,
  onAdjustFrequency,
  onClose,
}: {
  report: HealthCheckReport;
  integrityReport: IntegrityReport | null;
  integrityHistory: IntegrityScanSnapshot[];
  onRelink: (id: number, newPath: string) => Promise<void>;
  onRemoveStale: (ids: number[]) => Promise<void>;
  onEnableReminders: () => void;
  onAdjustFrequency: (freq: import("../../lib/integrity-reminder").ReminderFrequency) => void;
  onClose: () => void;
}) {
  const handleExport = async (format: "json" | "md") => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const ir = integrityReport ?? { entries: [], healthy: 0, missing: 0, moved: 0 };
    const payload = buildExportPayload(ir, integrityHistory, hcReport);
    const content = format === "json" ? formatJSON(payload) : formatMarkdown(payload);
    const ext = format === "json" ? "json" : "md";

    const filePath = await save({
      defaultPath: `kb-health-check.${ext}`,
      filters: [{ name: format === "json" ? "JSON" : "Markdown", extensions: [ext] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, content);
  };

  const handleQuickAction = (action: RecommendationAction) => {
    switch (action.type) {
      case "relink-all": {
        const movedEntries = integrityReport?.entries.filter((e) => e.status === "moved") ?? [];
        for (const e of movedEntries) {
          if (e.movedCandidate) onRelink(e.id, e.movedCandidate);
        }
        break;
      }
      case "remove-stale":
        onRemoveStale(action.ids);
        break;
      case "enable-reminders":
        onEnableReminders();
        break;
      case "adjust-frequency":
        onAdjustFrequency(action.suggested);
        break;
    }
  };

  return (
    <div className="border-b border-border">
      <div className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <HeartPulse size={12} className={TIER_COLORS[hcReport.tier]} />
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Health Check
            </span>
            <span className={cn("text-xs font-medium", TIER_COLORS[hcReport.tier])}>
              {TIER_LABELS[hcReport.tier]}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => handleExport("json")}
              className="p-0.5 hover:bg-surface-3 rounded"
              title="Export health check as JSON"
            >
              <Download size={12} className="text-text-tertiary" />
            </button>
            <button
              type="button"
              onClick={() => handleExport("md")}
              className="p-0.5 hover:bg-surface-3 rounded"
              title="Export health check as Markdown"
            >
              <BookOpen size={12} className="text-text-tertiary" />
            </button>
            <button type="button" onClick={onClose} className="p-0.5 hover:bg-surface-3 rounded">
              <X size={12} className="text-text-tertiary" />
            </button>
          </div>
        </div>

        {/* Key counts */}
        <div className={cn("rounded px-2 py-1.5", TIER_BG_COLORS[hcReport.tier])}>
          <div className="grid grid-cols-4 gap-1 text-center">
            <div>
              <div className="text-sm font-medium text-text-primary tabular-nums">{hcReport.counts.total}</div>
              <div className="text-[9px] text-text-tertiary uppercase">Total</div>
            </div>
            <div>
              <div className="text-sm font-medium text-emerald-400 tabular-nums">{hcReport.counts.healthy}</div>
              <div className="text-[9px] text-text-tertiary uppercase">Healthy</div>
            </div>
            <div>
              <div className="text-sm font-medium text-amber-400 tabular-nums">{hcReport.counts.moved}</div>
              <div className="text-[9px] text-text-tertiary uppercase">Moved</div>
            </div>
            <div>
              <div className="text-sm font-medium text-red-400 tabular-nums">{hcReport.counts.missing}</div>
              <div className="text-[9px] text-text-tertiary uppercase">Missing</div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="space-y-1">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Recommendations
          </span>
          {hcReport.recommendations.map((rec) => (
            <div
              key={rec.id}
              className="flex items-start gap-1.5 py-1 px-1.5 rounded bg-surface-2"
            >
              <span className={cn("text-[10px] font-medium shrink-0 mt-px", PRIORITY_COLORS[rec.priority])}>
                {rec.priority === "info" ? <CheckCircle2 size={10} className="inline" /> : <Zap size={10} className="inline" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-[11px] text-text-primary">{rec.title}</p>
                  <span className={cn("text-[8px] font-medium uppercase leading-none px-1 py-px border rounded", PRIORITY_COLORS[rec.priority])}>
                    {rec.priority}
                  </span>
                  {rec.confidence && rec.priority !== "info" && (
                    <span className={cn("text-[8px] leading-none px-1 py-px border rounded", CONFIDENCE_COLORS[rec.confidence])} title={`Confidence: ${rec.confidence}`}>
                      {CONFIDENCE_LABELS[rec.confidence]}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-text-tertiary leading-snug">{rec.description}</p>
                {rec.action && (
                  <button
                    type="button"
                    onClick={() => handleQuickAction(rec.action!)}
                    className="mt-0.5 text-[10px] text-accent hover:text-accent/80 transition-colors"
                  >
                    Apply fix
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegritySection({
  report,
  history,
  onRelink,
  onRemove,
  onClose,
  reminderSettings,
  onReminderChange,
  healthThresholds,
  healthThresholdSource,
  hasWorkspace,
  onThresholdsChange,
  onThresholdsReset,
  onSaveForWorkspace,
  onResetWorkspace,
  onExportThresholds,
  onImportThresholds,
}: {
  report: { entries: IntegrityEntry[]; healthy: number; missing: number; moved: number };
  history: IntegrityScanSnapshot[];
  onRelink: (id: number, newPath: string) => Promise<void>;
  onRemove: (ids: number[]) => Promise<void>;
  onClose: () => void;
  reminderSettings: { enabled: boolean; frequency: ReminderFrequency };
  onReminderChange: (patch: Partial<{ enabled: boolean; frequency: ReminderFrequency }>) => void;
  healthThresholds: HealthThresholdSettings;
  healthThresholdSource: ThresholdSource;
  hasWorkspace: boolean;
  onThresholdsChange: (patch: Partial<HealthThresholdSettings>) => void;
  onThresholdsReset: () => void;
  onSaveForWorkspace: () => void;
  onResetWorkspace: () => void;
  onExportThresholds: () => string;
  onImportThresholds: (jsonString: string) => string | null;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);
  const staleEntries = report.entries.filter((e) => e.status !== "healthy");
  const movedEntries = report.entries.filter((e) => e.status === "moved");
  const missingEntries = report.entries.filter((e) => e.status === "missing");
  const allHealthy = staleEntries.length === 0;
  const trend = computeTrend(history);
  const coverage = computeScanCoverage(history);
  const internalThresholds = toHealthThresholds(healthThresholds);
  const healthTier = computeHealthTier(coverage, internalThresholds);
  const isDefaultThresholds =
    healthThresholds.goodMinScans7d === DEFAULT_THRESHOLD_SETTINGS.goodMinScans7d &&
    healthThresholds.goodMaxAgeDays === DEFAULT_THRESHOLD_SETTINGS.goodMaxAgeDays &&
    healthThresholds.poorMaxAgeDays === DEFAULT_THRESHOLD_SETTINGS.poorMaxAgeDays;

  const handleExport = async (format: "json" | "md") => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const payload = buildExportPayload(report, history);
    const content = format === "json" ? formatJSON(payload) : formatMarkdown(payload);
    const ext = format === "json" ? "json" : "md";

    const filePath = await save({
      defaultPath: `kb-integrity-report.${ext}`,
      filters: [{ name: format === "json" ? "JSON" : "Markdown", extensions: [ext] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, content);
  };

  return (
    <div className="border-b border-border">
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={12} className={allHealthy ? "text-emerald-400" : "text-amber-400"} />
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              KB Integrity
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHealth(!showHealth)}
                className={cn(
                  "p-0.5 rounded text-[10px] px-1 flex items-center gap-0.5",
                  showHealth ? "bg-accent/20 text-accent" : "hover:bg-surface-3 text-text-tertiary",
                )}
                title="Toggle scan health"
              >
                <Activity size={10} />
                <span className={TIER_COLORS[healthTier]}>{TIER_LABELS[healthTier]}</span>
              </button>
            )}
            {history.length > 1 && (
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  "p-0.5 rounded text-[10px] px-1",
                  showHistory ? "bg-accent/20 text-accent" : "hover:bg-surface-3 text-text-tertiary",
                )}
                title="Toggle scan history"
              >
                {history.length} scans
              </button>
            )}
            <button
              type="button"
              onClick={() => handleExport("json")}
              className="p-0.5 hover:bg-surface-3 rounded"
              title="Export as JSON (includes history)"
            >
              <Download size={12} className="text-text-tertiary" />
            </button>
            <button
              type="button"
              onClick={() => handleExport("md")}
              className="p-0.5 hover:bg-surface-3 rounded"
              title="Export as Markdown (includes history)"
            >
              <BookOpen size={12} className="text-text-tertiary" />
            </button>
            <button type="button" onClick={onClose} className="p-0.5 hover:bg-surface-3 rounded">
              <X size={12} className="text-text-tertiary" />
            </button>
          </div>
        </div>

        {/* Summary with trend indicators */}
        <div className="flex gap-2 text-[11px]">
          <span className="text-emerald-400">
            {report.healthy} healthy
            {trend && trend.healthyDelta !== 0 && (
              <span className={trend.healthyDelta > 0 ? "text-emerald-500" : "text-red-400"}>
                {" "}{formatDelta(trend.healthyDelta)}
              </span>
            )}
          </span>
          {report.moved > 0 && (
            <span className="text-amber-400">
              {report.moved} moved
              {trend && trend.movedDelta !== 0 && (
                <span className={trend.movedDelta < 0 ? "text-emerald-500" : "text-red-400"}>
                  {" "}{formatDelta(trend.movedDelta)}
                </span>
              )}
            </span>
          )}
          {report.missing > 0 && (
            <span className="text-red-400">
              {report.missing} missing
              {trend && trend.missingDelta !== 0 && (
                <span className={trend.missingDelta < 0 ? "text-emerald-500" : "text-red-400"}>
                  {" "}{formatDelta(trend.missingDelta)}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Scan health panel */}
        {showHealth && history.length > 0 && (
          <div className={cn("rounded px-2 py-1.5 space-y-1", TIER_BG_COLORS[healthTier])}>
            <div className="flex items-center gap-1.5">
              <Activity size={11} className={TIER_COLORS[healthTier]} />
              <span className={cn("text-[11px] font-medium", TIER_COLORS[healthTier])}>
                Scan Health: {TIER_LABELS[healthTier]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
              <span className="text-text-tertiary">Last scan</span>
              <span className="text-text-secondary tabular-nums">
                {coverage.latestScanAgeMs !== null ? formatAge(coverage.latestScanAgeMs) : "never"}
              </span>
              <span className="text-text-tertiary">7-day scans</span>
              <span className="text-text-secondary tabular-nums">{coverage.scansLast7d}</span>
              <span className="text-text-tertiary">30-day scans</span>
              <span className="text-text-secondary tabular-nums">{coverage.scansLast30d}</span>
              {coverage.streak > 0 && (
                <>
                  <span className="text-text-tertiary">Streak</span>
                  <span className="text-text-secondary tabular-nums">{coverage.streak}d</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowThresholds(!showThresholds)}
              className={cn(
                "text-[10px] px-1 py-0.5 rounded transition-colors",
                showThresholds ? "text-accent" : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              <Settings2 size={10} className="inline mr-0.5" />
              Thresholds
            </button>
            {showThresholds && (
              <div className="space-y-1 pt-0.5">
                {healthThresholdSource === "workspace" && (
                  <span className="inline-block text-[9px] px-1 py-px rounded bg-accent/15 text-accent">
                    Workspace
                  </span>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-[10px] items-center">
                  <label className="text-text-tertiary" title="Minimum scans in the last 7 days for 'Good' tier">
                    Good: min scans/7d
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={healthThresholds.goodMinScans7d}
                    onChange={(e) => onThresholdsChange({ goodMinScans7d: Number(e.target.value) })}
                    className="w-12 text-[10px] bg-surface-2 border border-border rounded px-1 py-0.5 text-text-secondary text-right tabular-nums focus:outline-none focus:border-accent"
                  />
                  <label className="text-text-tertiary" title="Maximum scan age in days for 'Good' tier">
                    Good: max age (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={healthThresholds.goodMaxAgeDays}
                    onChange={(e) => onThresholdsChange({ goodMaxAgeDays: Number(e.target.value) })}
                    className="w-12 text-[10px] bg-surface-2 border border-border rounded px-1 py-0.5 text-text-secondary text-right tabular-nums focus:outline-none focus:border-accent"
                  />
                  <label className="text-text-tertiary" title="Maximum scan age in days before 'Poor' tier">
                    Poor: max age (days)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={healthThresholds.poorMaxAgeDays}
                    onChange={(e) => onThresholdsChange({ poorMaxAgeDays: Number(e.target.value) })}
                    className="w-12 text-[10px] bg-surface-2 border border-border rounded px-1 py-0.5 text-text-secondary text-right tabular-nums focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {!isDefaultThresholds && (
                    <button
                      type="button"
                      onClick={onThresholdsReset}
                      className="flex items-center gap-0.5 text-[10px] text-text-tertiary hover:text-accent transition-colors"
                      title="Reset thresholds to defaults"
                    >
                      <RotateCcw size={9} />
                      Reset to defaults
                    </button>
                  )}
                  {hasWorkspace && healthThresholdSource === "global" && (
                    <button
                      type="button"
                      onClick={onSaveForWorkspace}
                      className="flex items-center gap-0.5 text-[10px] text-text-tertiary hover:text-accent transition-colors"
                      title="Save these thresholds for the current workspace only"
                    >
                      <Save size={9} />
                      Save for workspace
                    </button>
                  )}
                  {healthThresholdSource === "workspace" && (
                    <button
                      type="button"
                      onClick={onResetWorkspace}
                      className="flex items-center gap-0.5 text-[10px] text-text-tertiary hover:text-accent transition-colors"
                      title="Remove workspace override and use global defaults"
                    >
                      <RotateCcw size={9} />
                      Use global defaults
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const { save } = await import("@tauri-apps/plugin-dialog");
                      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                      const content = onExportThresholds();
                      const filePath = await save({
                        defaultPath: "integrity-thresholds.json",
                        filters: [{ name: "JSON", extensions: ["json"] }],
                      });
                      if (!filePath) return;
                      await writeTextFile(filePath, content);
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-text-tertiary hover:text-accent transition-colors"
                    title="Export threshold config to JSON file"
                  >
                    <Download size={9} />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const { open } = await import("@tauri-apps/plugin-dialog");
                      const { readTextFile } = await import("@tauri-apps/plugin-fs");
                      const filePath = await open({
                        filters: [{ name: "JSON", extensions: ["json"] }],
                        multiple: false,
                        directory: false,
                      });
                      if (!filePath) return;
                      try {
                        const content = await readTextFile(filePath as string);
                        const error = onImportThresholds(content);
                        if (error) {
                          const { toast } = await import("../../stores/toast");
                          toast.error(`Import failed: ${error}`);
                        } else {
                          const { toast } = await import("../../stores/toast");
                          toast.success("Threshold config imported successfully");
                        }
                      } catch (err) {
                        const { toast } = await import("../../stores/toast");
                        toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
                      }
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-text-tertiary hover:text-accent transition-colors"
                    title="Import threshold config from JSON file"
                  >
                    <Upload size={9} />
                    Import
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {allHealthy && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 size={12} />
            All source references are valid.
          </div>
        )}

        {/* Scan history list */}
        {showHistory && history.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Recent Scans
            </span>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {history.map((snap, i) => (
                <div
                  key={snap.id}
                  className={cn(
                    "flex items-center gap-2 py-0.5 px-1.5 rounded text-[10px]",
                    i === 0 ? "bg-accent/10" : "bg-surface-2",
                  )}
                >
                  <span className="text-text-tertiary shrink-0 tabular-nums">
                    {new Date(snap.scannedAt + "Z").toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-emerald-400 tabular-nums">{snap.healthy}h</span>
                  {snap.missing > 0 && <span className="text-red-400 tabular-nums">{snap.missing}m</span>}
                  {snap.moved > 0 && <span className="text-amber-400 tabular-nums">{snap.moved}mv</span>}
                  {snap.notes && (
                    <span className="text-text-tertiary truncate" title={snap.notes}>
                      {snap.notes}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Moved candidates — batch relink */}
        {movedEntries.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Moved ({movedEntries.length})
            </span>
            {movedEntries.map((entry) => (
              <IntegrityEntryRow key={entry.id} entry={entry} onRelink={onRelink} onRemove={onRemove} />
            ))}
            {movedEntries.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  for (const e of movedEntries) {
                    if (e.movedCandidate) onRelink(e.id, e.movedCandidate);
                  }
                }}
                className="w-full text-[11px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition-colors"
              >
                Relink all {movedEntries.length} moved documents
              </button>
            )}
          </div>
        )}

        {/* Missing — remove */}
        {missingEntries.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Missing ({missingEntries.length})
            </span>
            {missingEntries.map((entry) => (
              <IntegrityEntryRow key={entry.id} entry={entry} onRelink={onRelink} onRemove={onRemove} />
            ))}
            {missingEntries.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(missingEntries.map((e) => e.id))}
                className="w-full text-[11px] px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Remove all {missingEntries.length} missing entries
              </button>
            )}
          </div>
        )}

        {/* Reminder settings */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <button
            type="button"
            onClick={() => onReminderChange({ enabled: !reminderSettings.enabled })}
            className={cn(
              "flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors",
              reminderSettings.enabled
                ? "bg-accent/15 text-accent"
                : "bg-surface-2 text-text-tertiary hover:bg-surface-3",
            )}
            title={reminderSettings.enabled ? "Disable scan reminders" : "Enable scan reminders"}
          >
            {reminderSettings.enabled ? <Bell size={11} /> : <BellOff size={11} />}
            Reminders
          </button>
          {reminderSettings.enabled && (
            <select
              value={reminderSettings.frequency}
              onChange={(e) => onReminderChange({ frequency: e.target.value as ReminderFrequency })}
              className="text-[11px] bg-surface-2 border border-border rounded px-1 py-0.5 text-text-secondary focus:outline-none focus:border-accent"
            >
              {FREQUENCY_IDS.map((id) => (
                <option key={id} value={id}>{FREQUENCY_LABELS[id]}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrityEntryRow({
  entry,
  onRelink,
  onRemove,
}: {
  entry: IntegrityEntry;
  onRelink: (id: number, newPath: string) => Promise<void>;
  onRemove: (ids: number[]) => Promise<void>;
}) {
  const filename = entry.sourcePath.split("/").pop() || entry.title;

  return (
    <div className="flex items-center gap-1.5 py-1 px-1.5 rounded bg-surface-2 group">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary truncate" title={entry.sourcePath}>
          {filename}
        </p>
        {entry.movedCandidate && (
          <p className="text-[10px] text-text-tertiary truncate" title={entry.movedCandidate}>
            &rarr; {entry.movedCandidate.split("/").pop()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {entry.movedCandidate && (
          <button
            type="button"
            onClick={() => onRelink(entry.id, entry.movedCandidate!)}
            className="p-0.5 hover:bg-surface-3 rounded text-accent"
            title={`Relink to ${entry.movedCandidate}`}
          >
            <Link2 size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove([entry.id])}
          className="p-0.5 hover:bg-surface-3 rounded text-text-tertiary hover:text-red-400"
          title="Remove from KB"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function HighlightedText({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark key={`${i}-${seg.text}`} className="bg-accent/20 text-accent rounded-sm px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={`${i}-${seg.text}`}>{seg.text}</span>
        ),
      )}
    </>
  );
}
