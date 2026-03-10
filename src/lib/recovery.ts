/**
 * Crash-recovery draft persistence via localStorage.
 *
 * Drafts are keyed by file path and store the latest editor content so that
 * unsaved work can be recovered after an unexpected quit or crash.
 */

const STORAGE_PREFIX = "lazy-editor:recovery:";
const UNTITLED_KEY = "__untitled__";
const MAX_DRAFTS = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface RecoveryDraft {
  filePath: string;
  content: string;
  timestamp: number;
}

function storageKey(filePath: string | null): string {
  return STORAGE_PREFIX + (filePath ?? UNTITLED_KEY);
}

/** Persist a recovery draft for the given file. */
export function persistDraft(filePath: string | null, content: string): void {
  try {
    const draft: RecoveryDraft = {
      filePath: filePath ?? UNTITLED_KEY,
      content,
      timestamp: Date.now(),
    };
    localStorage.setItem(storageKey(filePath), JSON.stringify(draft));
  } catch {
    // localStorage full or disabled — silently skip
  }
}

/** Retrieve a recovery draft for the given file (if any). */
export function getDraft(filePath: string | null): RecoveryDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(filePath));
    if (!raw) return null;
    return JSON.parse(raw) as RecoveryDraft;
  } catch {
    return null;
  }
}

/** Remove the recovery draft for the given file. */
export function clearDraft(filePath: string | null): void {
  try {
    localStorage.removeItem(storageKey(filePath));
  } catch {
    // ignore
  }
}

/** Return all stored recovery draft keys. */
export function getAllDraftKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
  } catch {
    // ignore
  }
  return keys;
}

/**
 * Check if a recovery draft exists for the given file that differs from
 * the current on-disk content. Returns the draft if recovery is needed,
 * or null if no action is required.
 */
export function checkRecovery(
  filePath: string | null,
  currentContent: string,
): RecoveryDraft | null {
  const draft = getDraft(filePath);
  if (!draft) return null;
  // Only offer recovery when the draft content actually differs
  if (draft.content === currentContent) {
    clearDraft(filePath);
    return null;
  }
  return draft;
}

/**
 * Remove stale drafts (older than MAX_AGE_MS) and cap total drafts
 * to MAX_DRAFTS, evicting oldest first.
 */
export function cleanupDrafts(): void {
  try {
    const now = Date.now();
    const entries: { key: string; timestamp: number }[] = [];

    for (const key of getAllDraftKeys()) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const draft = JSON.parse(raw) as RecoveryDraft;
        if (now - draft.timestamp > MAX_AGE_MS) {
          localStorage.removeItem(key);
        } else {
          entries.push({ key, timestamp: draft.timestamp });
        }
      } catch {
        localStorage.removeItem(key);
      }
    }

    // Cap at MAX_DRAFTS — remove oldest
    if (entries.length > MAX_DRAFTS) {
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = entries.slice(0, entries.length - MAX_DRAFTS);
      for (const { key } of toRemove) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}
