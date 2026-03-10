import { AlertCircle, CheckCircle2, Loader2, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { goalLabel, goalProgress, readingTimeMinutes } from "../../lib/writing-metrics";
import { useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";
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
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const isDirty = useFilesStore((s) => s.isDirty);
  const aiPhase = useAiStore((s) => s.aiPhase);
  const currentAction = useAiStore((s) => s.currentAction);
  const goal = useWritingGoalsStore((s) =>
    activeFilePath ? s.getGoal(activeFilePath) : null,
  );

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
        </div>
      )}

      <span className="text-text-tertiary">
        {activeFilePath ? activeFilePath.split("/").pop() : "No file"}
      </span>
    </div>
  );
}
