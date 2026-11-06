import type { AppShellPhase } from "@/appBoot";
import { create } from "zustand";

interface AppShellState {
  phase: AppShellPhase;
  error: string | null;
  setPhase: (phase: AppShellPhase) => void;
  setError: (message: string | null) => void;
}

export const useAppShellStore = create<AppShellState>((set) => ({
  phase: "loading",
  error: null,
  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error }),
}));
