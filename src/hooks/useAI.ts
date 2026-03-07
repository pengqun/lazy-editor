import { useCallback, useEffect } from "react";
import { listenToAiStream, listenToAiPhase } from "../lib/tauri";
import { useEditorStore } from "../stores/editor";
import { useAiStore } from "../stores/ai";
import { toast } from "../stores/toast";

export function useAIStream() {
  const setAiStreaming = useEditorStore((s) => s.setAiStreaming);
  const appendAiStream = useEditorStore((s) => s.appendAiStream);
  const clearAiStream = useEditorStore((s) => s.clearAiStream);
  const editor = useEditorStore((s) => s.editor);
  const setAiPhase = useAiStore((s) => s.setAiPhase);

  useEffect(() => {
    const cleanupStream = listenToAiStream(
      (chunk) => {
        appendAiStream(chunk);
        // Insert streamed text at current cursor position
        if (editor && !editor.isDestroyed) {
          editor.commands.insertContent(chunk);
        }
      },
      () => {
        setAiStreaming(false);
        setAiPhase("done");
        // Auto-reset to idle after a brief display of "done"
        setTimeout(() => {
          useAiStore.getState().setAiPhase("idle");
        }, 2000);
      },
      (error) => {
        console.error("AI stream error:", error);
        setAiStreaming(false);
        setAiPhase("error");
        toast.error(`AI stream error: ${error}`);
      },
    );

    const cleanupPhase = listenToAiPhase((phase) => {
      setAiPhase(phase);
    });

    return () => {
      cleanupStream();
      cleanupPhase();
    };
  }, [editor, setAiStreaming, appendAiStream, setAiPhase]);

  const startStream = useCallback(() => {
    clearAiStream();
    setAiStreaming(true);
  }, [clearAiStream, setAiStreaming]);

  return { startStream };
}
