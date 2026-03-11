import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
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
import { toast } from "./toast";

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

export type RetrievalScope = "all" | "pinned";

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
  viewChunkLoading: boolean;

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
  closeChunkViewer: () => void;
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
  viewedChunk: null,
  viewChunkLoading: false,
  viewedChunkQuery: null,
  viewedChunkScore: null,

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
    set({ _workspacePath: path });
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

  viewChunk: async (chunkId, query, score) => {
    set({ viewChunkLoading: true });
    try {
      const chunk = await invoke<ChunkContext>("get_kb_chunk", { chunkId });
      set({
        viewedChunk: chunk,
        viewChunkLoading: false,
        // Preserve query/score context when navigating between chunks (pass undefined to keep previous)
        ...(query !== undefined ? { viewedChunkQuery: query || null } : {}),
        ...(score !== undefined ? { viewedChunkScore: score } : {}),
      });
    } catch (err) {
      console.error("Failed to load chunk:", err);
      toast.error("Failed to load source chunk");
      set({ viewChunkLoading: false });
    }
  },

  closeChunkViewer: () =>
    set({ viewedChunk: null, viewedChunkQuery: null, viewedChunkScore: null }),
}));
