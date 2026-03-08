import { useCallback, useEffect, useRef } from "react";
import { listenToAiPhase, listenToAiStream } from "../lib/tauri";
import { useAiStore } from "../stores/ai";
import { useEditorStore } from "../stores/editor";
import { toast } from "../stores/toast";

export function useAIStream() {
  const setAiStreaming = useEditorStore((s) => s.setAiStreaming);
  const appendAiStream = useEditorStore((s) => s.appendAiStream);
  const clearAiStream = useEditorStore((s) => s.clearAiStream);
  const editor = useEditorStore((s) => s.editor);
  const setAiPhase = useAiStore((s) => s.setAiPhase);

  const firstChunkRef = useRef(true);

  useEffect(() => {
    const cleanupStream = listenToAiStream(
      (chunk) => {
        appendAiStream(chunk);

        if (!editor || editor.isDestroyed) return;

        // On the very first chunk, apply cursor positioning based on the locked mode.
        if (firstChunkRef.current) {
          firstChunkRef.current = false;

          const mode = useAiStore.getState().lockedPlacement ?? "insert_at_cursor";

          switch (mode) {
            case "replace_selection": {
              const { from, to } = editor.state.selection;
              if (from !== to) {
                editor.chain().focus().deleteRange({ from, to }).run();
              }
              break;
            }
            case "append_to_end": {
              editor.commands.focus("end");
              editor.commands.insertContent("\n\n");
              break;
            }
            case "insert_at_cursor":
            default:
              break;
          }
        }

        editor.commands.insertContent(chunk);
      },
      () => {
        setAiStreaming(false);
        setAiPhase("done");
        firstChunkRef.current = true;
        setTimeout(() => {
          useAiStore.getState().setAiPhase("idle");
        }, 2000);
      },
      (error) => {
        console.error("AI stream error:", error);
        setAiStreaming(false);
        setAiPhase("error");
        firstChunkRef.current = true;
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
    firstChunkRef.current = true;
  }, [clearAiStream, setAiStreaming]);

  return { startStream };
}
