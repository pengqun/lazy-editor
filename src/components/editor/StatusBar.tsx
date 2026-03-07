import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";

export function StatusBar() {
  const editor = useEditorStore((s) => s.editor);
  const isAiStreaming = useEditorStore((s) => s.isAiStreaming);
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const isDirty = useFilesStore((s) => s.isDirty);

  const wordCount = editor ? editor.state.doc.textContent.split(/\s+/).filter(Boolean).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

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

      {isAiStreaming && <span className="text-accent animate-pulse">AI writing...</span>}

      <span className="text-text-tertiary">
        {activeFilePath ? activeFilePath.split("/").pop() : "No file"}
      </span>
    </div>
  );
}
