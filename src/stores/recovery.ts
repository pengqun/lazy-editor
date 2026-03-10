import {
  type RecoveryDraft,
  checkRecovery,
  cleanupDrafts,
  clearDraft,
} from "@/lib/recovery";
import { create } from "zustand";

interface RecoveryState {
  /** Draft pending user decision (restore or discard). */
  pendingDraft: RecoveryDraft | null;

  /** Show the recovery prompt dialog. */
  showRecoveryDialog: boolean;

  /**
   * Check for a recoverable draft when a file is opened.
   * If a draft exists that differs from disk content, store it as pending.
   */
  checkOnOpen: (filePath: string | null, diskContent: string) => void;

  /** User chose to restore — returns the draft content and clears state. */
  acceptRecovery: () => string | null;

  /** User chose to discard — clears both the draft and state. */
  discardRecovery: () => void;
}

export const useRecoveryStore = create<RecoveryState>((set, get) => ({
  pendingDraft: null,
  showRecoveryDialog: false,

  checkOnOpen: (filePath, diskContent) => {
    const draft = checkRecovery(filePath, diskContent);
    if (draft) {
      set({ pendingDraft: draft, showRecoveryDialog: true });
    }
  },

  acceptRecovery: () => {
    const { pendingDraft } = get();
    if (!pendingDraft) return null;
    const content = pendingDraft.content;
    clearDraft(pendingDraft.filePath === "__untitled__" ? null : pendingDraft.filePath);
    set({ pendingDraft: null, showRecoveryDialog: false });
    return content;
  },

  discardRecovery: () => {
    const { pendingDraft } = get();
    if (pendingDraft) {
      clearDraft(pendingDraft.filePath === "__untitled__" ? null : pendingDraft.filePath);
    }
    set({ pendingDraft: null, showRecoveryDialog: false });
  },
}));

/** Run cleanup on import (app startup). */
cleanupDrafts();
