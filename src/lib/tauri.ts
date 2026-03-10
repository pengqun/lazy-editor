import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import type { AiPhase } from "../stores/ai";

export async function openFileDialog(): Promise<string | null> {
  return invoke<string | null>("open_file_dialog");
}

export async function openFolderDialog(): Promise<string | null> {
  return invoke<string | null>("open_folder_dialog");
}

export async function setWorkspacePath(path: string): Promise<void> {
  return invoke("set_workspace_path", { path });
}

function registerListener<T>(event: string, handler: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  let disposed = false;

  listen<T>(event, (evt) => handler(evt.payload))
    .then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    })
    .catch((err) => {
      console.error(`Failed to listen to ${event}:`, err);
    });

  return () => {
    disposed = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}

export function listenToAiStream(
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): () => void {
  const stopChunk = registerListener<string>("ai-stream-chunk", onChunk);
  const stopDone = registerListener<void>("ai-stream-done", onDone);
  const stopError = registerListener<string>("ai-stream-error", onError);

  return () => {
    stopChunk();
    stopDone();
    stopError();
  };
}

export function listenToAiPhase(onPhase: (phase: AiPhase) => void): () => void {
  return registerListener<AiPhase>("ai-action-phase", onPhase);
}

export interface CitationSource {
  documentTitle: string;
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  score: number;
}

export function listenToAiSources(
  onSources: (sources: CitationSource[]) => void,
): () => void {
  return registerListener<CitationSource[]>("ai-stream-sources", onSources);
}

export function listenToIngestProgress(onProgress: (msg: string) => void): () => void {
  return registerListener<string>("ingest-progress", onProgress);
}
