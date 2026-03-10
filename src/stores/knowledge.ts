import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  type RetrievalPresetId,
  RETRIEVAL_PRESETS,
  detectMatchingPreset,
  loadPresetFromStorage,
  savePresetToStorage,
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

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  documents: [],
  isIngesting: false,
  ingestProgress: "",
  searchResults: [],
  pinnedDocIds: new Set(),
  retrievalTopK: _initialConfig?.topK ?? 5,
  retrievalScope: (_initialConfig?.scope ?? "all") as RetrievalScope,
  activePreset: _initialPreset,
  viewedChunk: null,
  viewChunkLoading: false,
  viewedChunkQuery: null,
  viewedChunkScore: null,

  setRetrievalTopK: (topK) => {
    const clamped = Math.max(1, Math.min(10, topK));
    const newPreset = detectMatchingPreset(clamped, get().retrievalScope);
    savePresetToStorage(newPreset);
    set({ retrievalTopK: clamped, activePreset: newPreset });
  },
  setRetrievalScope: (scope) => {
    const newPreset = detectMatchingPreset(get().retrievalTopK, scope);
    savePresetToStorage(newPreset);
    set({ retrievalScope: scope, activePreset: newPreset });
  },

  setPreset: (id) => {
    const preset = RETRIEVAL_PRESETS[id];
    savePresetToStorage(id);
    set({ activePreset: id, retrievalTopK: preset.topK, retrievalScope: preset.scope });
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
