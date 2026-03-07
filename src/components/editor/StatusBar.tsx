import { useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";

const PHASE_LABELS: Record<string, string> = {
  searching_kb: "Searching knowledge base...",
  streaming: "AI writing...",
  done: "AI done",
  error: "AI error",
};

export function StatusBar() {
  const editor = useEditorStore((s) => s.editor);
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const isDirty = useFilesStore((s) => s.isDirty);
  const aiPhase = useAiStore((s) => s.aiPhase);
  const currentAction = useAiStore((s) => s.currentAction);

  const wordCount = editor ? editor.state.doc.textContent.split(/\s+/).filter(Boolean).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  const phaseLabel = PHASE_LABELS[aiPhase];

  return (
    <div className="h-7 border-t border-border bg-surface-1 flex items-center px-4 text-xs text-text-tertiary gap-4">
      {activeFilePath && (
        <>
          <span>
            {wordCount} word{wordCount !== 1 ? "s" : ""}
          </span>
          <span>{readingTime} min read</span>
          <span>{isDirty ? "Unsaved" : "Saved"}</span>
        </>
      )}

      <div className="flex-1" />

      {phaseLabel && aiPhase !== "idle" && (
        <span className={aiPhase === "error" ? "text-red-400" : "text-accent animate-pulse"}>
          {currentAction ? `${currentAction}: ${phaseLabel}` : phaseLabel}
        </span>
      )}

      <span className="text-text-tertiary">
        {activeFilePath ? activeFilePath.split("/").pop() : "No file"}
      </span>
    </div>
  );
}
