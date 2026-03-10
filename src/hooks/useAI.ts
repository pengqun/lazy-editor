import { useCallback, useEffect, useRef } from "react";
import { type CitationSource, listenToAiPhase, listenToAiSources, listenToAiStream } from "../lib/tauri";
import { useAiStore } from "../stores/ai";
import { useEditorStore } from "../stores/editor";
import { toast } from "../stores/toast";

/** Deduplicate citations by document ID, keeping the highest-scoring entry per doc. */
export function deduplicateCitations(citations: CitationSource[]): CitationSource[] {
  const byDoc = new Map<number, CitationSource>();
  for (const c of citations) {
    const existing = byDoc.get(c.documentId);
    if (!existing || c.score > existing.score) {
      byDoc.set(c.documentId, c);
    }
  }
  return Array.from(byDoc.values());
}

/** Build a compact HTML citation block for insertion into the editor. */
export function buildCitationHtml(citations: CitationSource[]): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const items = deduped
    .map((c, i) => `[${i + 1}] ${c.documentTitle}`)
    .join("&nbsp;&nbsp;");

  return `<p><br></p><p><em>Sources: ${items}</em></p>`;
}

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
            default:
              break;
          }
        }

        editor.commands.insertContent(chunk);
      },
      () => {
        // Insert citation block if sources were provided
        if (editor && !editor.isDestroyed) {
          const { citations } = useAiStore.getState();
          const html = buildCitationHtml(citations);
          if (html) {
            editor.commands.insertContent(html);
          }
        }

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

    const cleanupSources = listenToAiSources((sources) => {
      useAiStore.getState().setCitations(sources);
    });

    const cleanupPhase = listenToAiPhase((phase) => {
      setAiPhase(phase);
    });

    return () => {
      cleanupStream();
      cleanupSources();
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
