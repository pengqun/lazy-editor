import { useEffect, useRef } from "react";
import { useFilesStore } from "../stores/files";

export function useAutoSave(debounceMs = 1000) {
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const activeFileContent = useFilesStore((s) => s.activeFileContent);
  const isDirty = useFilesStore((s) => s.isDirty);
  const saveFile = useFilesStore((s) => s.saveFile);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDirty || !activeFilePath) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveFile();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [activeFileContent, isDirty, activeFilePath, saveFile, debounceMs]);
}
