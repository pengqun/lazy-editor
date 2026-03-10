import { AlertCircle, CheckCircle2, ClipboardList, Copy, Loader2, Target } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  type CitationTemplateId,
  CITATION_TEMPLATES,
  TEMPLATE_IDS,
  buildReferenceHtml,
  copyReferencesToClipboard,
  loadLastTemplate,
  saveLastTemplate,
} from "../../lib/citation-notes";
import { goalLabel, goalProgress, readingTimeMinutes } from "../../lib/writing-metrics";
import { useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";
import { toast } from "../../stores/toast";
import { useWritingGoalsStore } from "../../stores/writing-goals";
import { WritingGoalPopover } from "./WritingGoalPopover";

const PHASE_LABELS: Record<string, string> = {
  searching_kb: "Searching knowledge base...",
  streaming: "Generating content...",
  done: "Completed",
  error: "Failed",
};

const PHASE_PROGRESS: Record<string, number> = {
  searching_kb: 35,
  streaming: 80,
  done: 100,
  error: 100,
};

export function StatusBar() {
  const wordCount = useEditorStore((s) => s.wordCount);
  const editor = useEditorStore((s) => s.editor);
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const isDirty = useFilesStore((s) => s.isDirty);
  const aiPhase = useAiStore((s) => s.aiPhase);
  const currentAction = useAiStore((s) => s.currentAction);
  const citations = useAiStore((s) => s.citations);
  const goal = useWritingGoalsStore((s) =>
    activeFilePath ? s.getGoal(activeFilePath) : null,
  );

  const [templateId, setTemplateId] = useState<CitationTemplateId>(loadLastTemplate);

  const handleTemplateChange = useCallback((id: CitationTemplateId) => {
    setTemplateId(id);
    saveLastTemplate(id);
  }, []);

  const handleInsertReferences = useCallback(() => {
    if (!editor || editor.isDestroyed || citations.length === 0) return;
    const html = buildReferenceHtml(citations, templateId);
    if (html) {
      editor.commands.focus("end");
      editor.commands.insertContent(html);
      toast.success("References inserted");
    }
  }, [editor, citations, templateId]);

  const handleCopyReferences = useCallback(async () => {
    if (citations.length === 0) return;
    const text = await copyReferencesToClipboard(citations, templateId);
    if (text) toast.success("References copied to clipboard");
  }, [citations, templateId]);

  const [showGoalPopover, setShowGoalPopover] = useState(false);

  const readingTime = useMemo(() => readingTimeMinutes(wordCount), [wordCount]);
  const phaseLabel = PHASE_LABELS[aiPhase];
  const progress = PHASE_PROGRESS[aiPhase] ?? 0;

  const hasGoal = goal !== null && goal.target > 0;
  const pct = useMemo(
    () => (hasGoal ? goalProgress(wordCount, goal!.target) : 0),
    [hasGoal, wordCount, goal],
  );
  const label = useMemo(
    () => (hasGoal ? goalLabel(wordCount, goal!.target) : null),
    [hasGoal, wordCount, goal],
  );

  return (
    <div className="h-7 border-t border-border bg-surface-1 flex items-center px-4 text-xs text-text-tertiary gap-4">
      {activeFilePath && (
        <>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowGoalPopover((v) => !v)}
              className="flex items-center gap-1 hover:text-text-primary"
              title={label ?? "Set writing goal"}
            >
              {hasGoal && <Target size={10} className="text-accent" />}
              <span>
                {wordCount} word{wordCount !== 1 ? "s" : ""}
              </span>
            </button>
            {showGoalPopover && (
              <WritingGoalPopover
                filePath={activeFilePath}
                onClose={() => setShowGoalPopover(false)}
              />
            )}
          </div>

          {hasGoal && (
            <div className="flex items-center gap-1.5" title={label!}>
              <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    pct >= 100 ? "bg-emerald-400" : "bg-accent"
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className={pct >= 100 ? "text-emerald-400" : ""}>{pct}%</span>
            </div>
          )}

          <span>{readingTime} min read</span>
          <span>{isDirty ? "Unsaved" : "Saved"}</span>
        </>
      )}

      <div className="flex-1" />

      {phaseLabel && aiPhase !== "idle" && (
        <div className="flex items-center gap-2 min-w-[280px]">
          {aiPhase === "error" ? (
            <AlertCircle size={12} className="text-red-400" />
          ) : aiPhase === "done" ? (
            <CheckCircle2 size={12} className="text-emerald-400" />
          ) : (
            <Loader2 size={12} className="text-accent animate-spin" />
          )}

          <span className={aiPhase === "error" ? "text-red-400" : "text-accent"}>
            {currentAction
              ? `${currentAction.charAt(0).toUpperCase() + currentAction.slice(1)}: ${phaseLabel}`
              : phaseLabel}
          </span>

          <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className={
                aiPhase === "error"
                  ? "h-full bg-red-400"
                  : "h-full bg-accent transition-all duration-500"
              }
              style={{ width: `${progress}%` }}
            />
          </div>

          {aiPhase === "done" && citations.length > 0 && (
            <div className="flex items-center gap-1">
              <select
                value={templateId}
                onChange={(e) => handleTemplateChange(e.target.value as CitationTemplateId)}
                title="Citation template"
                className="h-5 text-[10px] bg-surface-2 border border-border rounded text-text-secondary px-1 outline-none focus:border-accent"
              >
                {TEMPLATE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CITATION_TEMPLATES[id].label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleInsertReferences}
                title="Insert formatted reference block at end of document"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-accent hover:bg-surface-3 transition-colors"
              >
                <ClipboardList size={12} />
                <span>Insert</span>
              </button>
              <button
                type="button"
                onClick={handleCopyReferences}
                title="Copy formatted references to clipboard"
                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-surface-3 transition-colors"
              >
                <Copy size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      <span className="text-text-tertiary">
        {activeFilePath ? activeFilePath.split("/").pop() : "No file"}
      </span>
    </div>
  );
}
