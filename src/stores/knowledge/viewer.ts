import { invoke } from "@tauri-apps/api/core";
import type { ChunkContext, KnowledgeState, ViewChunkErrorKind, ViewChunkErrorState } from "./types";

export type ViewerStateSlice = Pick<KnowledgeState,
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

export function buildViewChunkError(kind: ViewChunkErrorKind): ViewChunkErrorState {
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

export function classifyViewChunkError(err: unknown): ViewChunkErrorKind {
  const message = String(err instanceof Error ? err.message : err);
  // Structured error codes from Rust backend (preferred path)
  if (message.startsWith("chunk-not-found:")) return "chunk-missing";
  if (message.startsWith("chunk-error:")) return "chunk-missing";
  // Frontend-only error kinds (set before backend call)
  if (message.includes("malformed")) return "malformed-link";
  if (message.includes("source") && message.includes("missing")) return "source-missing";
  return "chunk-missing";
}

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
