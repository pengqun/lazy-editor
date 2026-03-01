import { useEffect, useCallback } from "react";
import { useEditorStore } from "../stores/editor";
import { listenToAiStream } from "../lib/tauri";

export function useAIStream() {
  const setAiStreaming = useEditorStore((s) => s.setAiStreaming);
  const appendAiStream = useEditorStore((s) => s.appendAiStream);
  const clearAiStream = useEditorStore((s) => s.clearAiStream);
  const editor = useEditorStore((s) => s.editor);

  useEffect(() => {
    const cleanup = listenToAiStream(
      (chunk) => {
        appendAiStream(chunk);
        // Insert streamed text at current cursor position
        if (editor && !editor.isDestroyed) {
          editor.commands.insertContent(chunk);
        }
      },
      () => {
        setAiStreaming(false);
      },
      (error) => {
        console.error("AI stream error:", error);
        setAiStreaming(false);
      },
    );

    return cleanup;
  }, [editor, setAiStreaming, appendAiStream]);

  const startStream = useCallback(() => {
    clearAiStream();
    setAiStreaming(true);
  }, [clearAiStream, setAiStreaming]);

  return { startStream };
}
