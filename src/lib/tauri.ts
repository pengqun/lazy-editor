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

export function listenToAiStream(
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): () => void {
  const unlisteners: UnlistenFn[] = [];

  listen<string>("ai-stream-chunk", (event) => {
    onChunk(event.payload);
  }).then((fn) => unlisteners.push(fn));

  listen<void>("ai-stream-done", () => {
    onDone();
  }).then((fn) => unlisteners.push(fn));

  listen<string>("ai-stream-error", (event) => {
    onError(event.payload);
  }).then((fn) => unlisteners.push(fn));

  return () => {
    unlisteners.forEach((fn) => fn());
  };
}

export function listenToAiPhase(onPhase: (phase: AiPhase) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  listen<AiPhase>("ai-action-phase", (event) => {
    onPhase(event.payload);
  }).then((fn) => {
    unlisten = fn;
  });
  return () => unlisten?.();
}

export function listenToIngestProgress(onProgress: (msg: string) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  listen<string>("ingest-progress", (event) => {
    onProgress(event.payload);
  }).then((fn) => {
    unlisten = fn;
  });
  return () => unlisten?.();
}
