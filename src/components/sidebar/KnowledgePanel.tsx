import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  FilePlus2,
  Loader2,
  Pin,
  PinOff,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { type HighlightSegment, findMatchedTerms, highlightText } from "../../lib/kb-highlight";
import { PRESET_IDS, RETRIEVAL_PRESETS } from "../../lib/retrieval-presets";
import { listenToIngestProgress, openFileDialog } from "../../lib/tauri";
import { type RetrievalScope, useKnowledgeStore } from "../../stores/knowledge";

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
    viewedChunk,
    viewChunkLoading,
    viewChunk,
  } = useKnowledgeStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [showRetrievalSettings, setShowRetrievalSettings] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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
  if (viewedChunk || viewChunkLoading) {
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
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Retrieval Settings
            </span>
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
  const { viewedChunk, viewChunkLoading, viewChunk, closeChunkViewer, viewedChunkQuery, viewedChunkScore } = useKnowledgeStore();

  if (viewChunkLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 size={16} className="text-accent animate-spin" />
        <span className="text-xs text-text-tertiary mt-2">Loading source...</span>
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
