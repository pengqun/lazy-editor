import { Target, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWritingGoalsStore } from "../../stores/writing-goals";

interface Props {
  filePath: string;
  onClose: () => void;
}

const PRESETS = [500, 1000, 1500, 2000, 3000, 5000];

export function WritingGoalPopover({ filePath, onClose }: Props) {
  const goal = useWritingGoalsStore((s) => s.getGoal(filePath));
  const setGoal = useWritingGoalsStore((s) => s.setGoal);
  const clearGoal = useWritingGoalsStore((s) => s.clearGoal);

  const [customValue, setCustomValue] = useState(goal?.target?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSet = () => {
    const num = Number.parseInt(customValue, 10);
    if (num > 0) {
      setGoal(filePath, num);
      onClose();
    }
  };

  const handlePreset = (value: number) => {
    setGoal(filePath, value);
    onClose();
  };

  const handleClear = () => {
    clearGoal(filePath);
    onClose();
  };

  return (
    <div className="absolute bottom-8 left-0 z-50 w-64 rounded-lg border border-border bg-surface-1 shadow-lg p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-text-primary font-medium">
          <Target size={12} />
          Writing Goal
        </div>
        <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary">
          <X size={12} />
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handlePreset(p)}
            className={`px-2 py-0.5 rounded border text-text-secondary hover:bg-surface-2 ${
              goal?.target === p ? "border-accent text-accent" : "border-border"
            }`}
          >
            {p.toLocaleString()}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-2">
        <input
          ref={inputRef}
          type="number"
          min={1}
          placeholder="Custom..."
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSet()}
          className="flex-1 px-2 py-1 rounded border border-border bg-surface-0 text-text-primary outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={handleSet}
          className="px-2 py-1 rounded bg-accent text-white hover:opacity-90"
        >
          Set
        </button>
      </div>

      {goal && (
        <button
          type="button"
          onClick={handleClear}
          className="text-text-tertiary hover:text-red-400"
        >
          Clear goal
        </button>
      )}
    </div>
  );
}
