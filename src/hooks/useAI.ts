import { useCallback, useEffect, useRef } from "react";
import {
  CITATION_LINK_SELECTOR,
  parseCitationElement,
} from "../lib/citation-notes";
import {
  type CitationSource,
  listenToAiPhase,
  listenToAiSources,
  listenToAiStream,
} from "../lib/tauri";
import { useAiStore } from "../stores/ai";
import { useEditorStore } from "../stores/editor";
import { useKnowledgeStore } from "../stores/knowledge";
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

/** Escape HTML special chars for safe attribute values. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build a compact HTML citation block with clickable source links. */
export function buildCitationHtml(citations: CitationSource[]): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const items = deduped
    .map((c, i) => {
      const pct = Math.round(c.score * 100);
      const title = escapeAttr(`${c.documentTitle} — chunk ${c.chunkIndex + 1}, ${pct}% relevance`);
      const docTitle = escapeAttr(c.documentTitle);
      return `<a href="#" class="kb-source-link" data-chunk-id="${c.chunkId}" data-document-id="${c.documentId}" data-doc-title="${docTitle}" data-score="${c.score}" data-chunk-index="${c.chunkIndex}" title="${title}">[${i + 1}] ${escapeAttr(c.documentTitle)}</a>`;
    })
    .join("&nbsp;&nbsp;");

  return `<p><br></p><p><em>Sources: ${items}</em></p>`;
}

/**
 * Navigate to a citation's source chunk in the Knowledge Panel.
 * Opens the panel if closed and loads the chunk viewer with query/score context.
 */
export function navigateToCitationSource(
  chunkId: number,
  query?: string,
  score?: number,
  documentId?: number,
): void {
  const kbStore = useKnowledgeStore.getState();
  if (documentId != null && kbStore.documents.length > 0) {
    const exists = kbStore.documents.some((doc) => doc.id === documentId);
    if (!exists) {
      kbStore.setViewChunkError("source-missing");
      useEditorStore.getState().setRightPanel("knowledge");
      return;
    }
  }
  kbStore.viewChunk(chunkId, query, score);
  // Ensure the knowledge panel is visible
  useEditorStore.getState().setRightPanel("knowledge");
}

export function useAIStream() {
  const setAiStreaming = useEditorStore((s) => s.setAiStreaming);
  const appendAiStream = useEditorStore((s) => s.appendAiStream);
  const clearAiStream = useEditorStore((s) => s.clearAiStream);
  const editor = useEditorStore((s) => s.editor);
  const setAiPhase = useAiStore((s) => s.setAiPhase);

  const firstChunkRef = useRef(true);

  // Handle clicks on citation links in the editor
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Handle inline citation links (.kb-source-link) from AI stream
      const kbLink = target.closest<HTMLAnchorElement>(".kb-source-link");
      if (kbLink) {
        event.preventDefault();
        event.stopPropagation();

        const chunkId = Number(kbLink.dataset.chunkId);
        if (chunkId) {
          const score = kbLink.dataset.score ? Number(kbLink.dataset.score) : undefined;
          const query = useAiStore.getState().lastKbQuery || undefined;
          const documentId = kbLink.dataset.documentId ? Number(kbLink.dataset.documentId) : undefined;
          navigateToCitationSource(chunkId, query, score, documentId);
        } else {
          useKnowledgeStore.getState().setViewChunkError("malformed-link");
          useEditorStore.getState().setRightPanel("knowledge");
        }
        return;
      }

      // Handle reference block citation links (.citation-link) from buildReferenceHtml
      const citationLink = target.closest<HTMLAnchorElement>(CITATION_LINK_SELECTOR);
      if (citationLink) {
        event.preventDefault();
        event.stopPropagation();

        const parsed = parseCitationElement(citationLink);
        if (parsed) {
          // Prefer the query embedded in the reference list (survives across AI actions
          // and document switches); fall back to the current lastKbQuery.
          const refList = citationLink.closest<HTMLOListElement>("ol.citation-references");
          const query = refList?.dataset.query || useAiStore.getState().lastKbQuery || undefined;
          navigateToCitationSource(parsed.chunkId, query, parsed.score, parsed.documentId);
        } else {
          useKnowledgeStore.getState().setViewChunkError("malformed-link");
          useEditorStore.getState().setRightPanel("knowledge");
        }
        return;
      }
    };

    const editorDom = editor.view.dom;
    editorDom.addEventListener("click", handleClick);
    return () => editorDom.removeEventListener("click", handleClick);
  }, [editor]);

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
