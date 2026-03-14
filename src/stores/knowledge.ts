import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { resolveThresholdSettings } from "../lib/integrity-health";
import {
  type RetrievalSettingsSource,
  RETRIEVAL_PRESETS,
  detectMatchingPreset,
  loadPresetFromStorage,
  resolveRetrievalSettings,
  saveDocRetrievalSettings,
  savePresetToStorage,
  saveWorkspaceRetrievalSettings,
} from "../lib/retrieval-presets";
import { loadIntegrityTrendHistory } from "../lib/integrity-trend-history";
import { loadBatchImpactSummary } from "../lib/integrity-batch-impact";
import { createBatchActionSlice, createBatchStateSlice } from "./knowledge/batch";
import { createIntegrityStateSlice } from "./knowledge/integrity";
import { createViewerStateSlice } from "./knowledge/viewer";
import { toast } from "./toast";
import { extractErrorMessage } from "./knowledge/integrity-utils";

// Re-exports: types (from ./knowledge/types)
export type {
  KBDocument, SearchResult, ChunkContext,
  ViewChunkErrorKind, ViewChunkErrorState, RetrievalScope,
  IntegrityStatus, IntegrityEntry, IntegrityReport, IntegrityScanSnapshot,
  KnowledgeState,
} from "./knowledge/types";

// Re-exports: slice factories
export { createBatchActionSlice, createBatchStateSlice };
export { createIntegrityStateSlice };
export { createViewerStateSlice };

// Internal imports used by the store body
import type { KBDocument, KnowledgeState, RetrievalScope, SearchResult } from "./knowledge/types";

const _initialPreset = loadPresetFromStorage();
const _initialConfig = _initialPreset ? RETRIEVAL_PRESETS[_initialPreset] : null;

/** Persist current retrieval settings both globally and per-document. */
function _persistSettings({ activePreset, retrievalTopK, retrievalScope, _activeDocPath }: Pick<KnowledgeState, "activePreset" | "retrievalTopK" | "retrievalScope" | "_activeDocPath">) {
  savePresetToStorage(activePreset);
  if (_activeDocPath) {
    saveDocRetrievalSettings(_activeDocPath, { preset: activePreset, topK: retrievalTopK, scope: retrievalScope });
  }
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
  ...createBatchActionSlice(set, get),

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
    const { activePreset, retrievalTopK, retrievalScope } = get();
    saveWorkspaceRetrievalSettings(_workspacePath, { preset: activePreset, topK: retrievalTopK, scope: retrievalScope });
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
      const message = extractErrorMessage(err);
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
      const message = extractErrorMessage(err);
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

}));
