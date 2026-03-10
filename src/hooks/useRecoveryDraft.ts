import { useEffect, useRef } from "react";
import { clearDraft, persistDraft } from "../lib/recovery";
import { useFilesStore } from "../stores/files";

const PERSIST_INTERVAL_MS = 2000;

/**
 * Periodically persists the current editor content to localStorage while
 * the document has unsaved changes. This ensures crash recovery data is
 * available even during continuous typing (when autosave's debounce hasn't
 * fired yet).
 *
 * The interval is cleared when the file is saved (isDirty becomes false)
 * or the active file changes.
 */
export function useRecoveryDraft() {
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const isDirty = useFilesStore((s) => s.isDirty);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isDirty) {
      // File was just saved — clear the recovery draft
      clearDraft(activeFilePath);
      return;
    }

    // Persist immediately on becoming dirty, then on interval
    const snap = () => {
      const { activeFilePath: path, activeFileContent: content, isDirty: dirty } =
        useFilesStore.getState();
      if (dirty) {
        persistDraft(path, content);
      }
    };

    snap();
    intervalRef.current = setInterval(snap, PERSIST_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isDirty, activeFilePath]);
}
