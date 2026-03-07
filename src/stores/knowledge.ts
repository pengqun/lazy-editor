import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

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
  score: number;
}

interface KnowledgeState {
  documents: KBDocument[];
  isIngesting: boolean;
  ingestProgress: string;
  searchResults: SearchResult[];
  pinnedDocIds: Set<number>;

  setIngestProgress: (msg: string) => void;
  loadDocuments: () => Promise<void>;
  ingestFile: (path: string) => Promise<void>;
  ingestText: (title: string, text: string) => Promise<void>;
  searchKB: (query: string, topK?: number) => Promise<SearchResult[]>;
  removeDocument: (id: number) => Promise<void>;
  togglePinDocument: (id: number) => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  documents: [],
  isIngesting: false,
  ingestProgress: "",
  searchResults: [],
  pinnedDocIds: new Set(),

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
    } catch (err) {
      console.error("Failed to ingest file:", err);
    } finally {
      set({ isIngesting: false, ingestProgress: "" });
    }
  },

  ingestText: async (title, text) => {
    set({ isIngesting: true, ingestProgress: "Processing text..." });
    try {
      await invoke("ingest_text", { title, text });
      await get().loadDocuments();
    } catch (err) {
      console.error("Failed to ingest text:", err);
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
}));
