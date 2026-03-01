import { useEffect, useState } from "react";
import {
  BookOpen,
  Search,
  Upload,
  Trash2,
  Pin,
  PinOff,
  Loader2,
} from "lucide-react";
import { useKnowledgeStore } from "../../stores/knowledge";
import { openFileDialog } from "../../lib/tauri";
import { cn } from "../../lib/cn";

export function KnowledgePanel() {
  const {
    documents,
    loadDocuments,
    ingestFile,
    searchKB,
    searchResults,
    removeDocument,
    isIngesting,
    ingestProgress,
    pinnedDocIds,
    togglePinDocument,
  } = useKnowledgeStore();

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleIngestFile = async () => {
    const path = await openFileDialog();
    if (path) {
      await ingestFile(path);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    await searchKB(searchQuery);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-accent" />
          <span className="text-sm font-medium text-text-secondary">
            Knowledge Base
          </span>
        </div>
        <button
          onClick={handleIngestFile}
          className="p-1 hover:bg-surface-3 rounded transition-colors"
          title="Add document to KB"
        >
          <Upload size={14} className="text-text-tertiary" />
        </button>
      </div>

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

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border-b border-border">
          <div className="px-3 py-2">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Search Results
            </span>
          </div>
          {searchResults.map((result, i) => (
            <div
              key={i}
              className="px-3 py-2 border-t border-border/50 hover:bg-surface-2 transition-colors"
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
                {result.chunkContent}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Documents List */}
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
                  onClick={() => removeDocument(doc.id)}
                  className="p-0.5 hover:bg-surface-3 rounded"
                  title="Remove from KB"
                >
                  <Trash2 size={12} className="text-text-tertiary hover:text-red-400" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded",
                pinnedDocIds.has(doc.id) ? "bg-accent/20 text-accent" : "bg-surface-3 text-text-tertiary",
              )}>
                {doc.sourceType}
              </span>
              <span className="text-xs text-text-tertiary">
                {doc.chunkCount} chunks
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
