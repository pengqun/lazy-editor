import { create } from "zustand";

const STORAGE_KEY = "lazy-editor:writing-goals";

export interface WritingGoal {
  target: number;
}

interface WritingGoalsState {
  /** Per-file writing goals keyed by absolute file path. */
  goals: Record<string, WritingGoal>;

  /** Set (or update) a word-count goal for a file. */
  setGoal: (filePath: string, target: number) => void;

  /** Clear the goal for a file. */
  clearGoal: (filePath: string) => void;

  /** Get the goal for a file (or null). */
  getGoal: (filePath: string) => WritingGoal | null;
}

function loadFromStorage(): Record<string, WritingGoal> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, WritingGoal>;
  } catch {
    return {};
  }
}

function saveToStorage(goals: Record<string, WritingGoal>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch {
    // localStorage full or disabled — silently skip
  }
}

export const useWritingGoalsStore = create<WritingGoalsState>((set, get) => ({
  goals: loadFromStorage(),

  setGoal: (filePath, target) => {
    const goals = { ...get().goals, [filePath]: { target } };
    saveToStorage(goals);
    set({ goals });
  },

  clearGoal: (filePath) => {
    const { [filePath]: _, ...rest } = get().goals;
    saveToStorage(rest);
    set({ goals: rest });
  },

  getGoal: (filePath) => get().goals[filePath] ?? null,
}));
