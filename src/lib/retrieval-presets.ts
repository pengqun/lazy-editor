import type { RetrievalScope } from "../stores/knowledge";

export type RetrievalPresetId = "writing" | "research" | "precision";

export interface RetrievalPresetConfig {
  topK: number;
  scope: RetrievalScope;
}

export interface RetrievalPreset extends RetrievalPresetConfig {
  id: RetrievalPresetId;
  label: string;
  description: string;
}

export const RETRIEVAL_PRESETS: Record<RetrievalPresetId, RetrievalPreset> = {
  writing: {
    id: "writing",
    label: "Writing",
    description: "Balanced context for creative writing",
    topK: 5,
    scope: "all",
  },
  research: {
    id: "research",
    label: "Research",
    description: "Maximum context from all sources",
    topK: 8,
    scope: "all",
  },
  precision: {
    id: "precision",
    label: "Precision",
    description: "Fewer, high-relevance results from pinned docs",
    topK: 3,
    scope: "pinned",
  },
};

export const PRESET_IDS: RetrievalPresetId[] = ["writing", "research", "precision"];

const STORAGE_KEY = "lazy-editor:retrieval-preset";

/** Load persisted preset ID from localStorage (null = custom / manual). */
export function loadPresetFromStorage(): RetrievalPresetId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in RETRIEVAL_PRESETS) return raw as RetrievalPresetId;
    return null;
  } catch {
    return null;
  }
}

/** Persist selected preset ID (null clears it). */
export function savePresetToStorage(id: RetrievalPresetId | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage full or disabled — silently skip
  }
}

/**
 * Check if current manual settings match any preset.
 * Returns the matching preset ID or null.
 */
export function detectMatchingPreset(
  topK: number,
  scope: RetrievalScope,
): RetrievalPresetId | null {
  for (const preset of Object.values(RETRIEVAL_PRESETS)) {
    if (preset.topK === topK && preset.scope === scope) {
      return preset.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-document retrieval settings
// ---------------------------------------------------------------------------

export interface DocRetrievalSettings {
  preset: RetrievalPresetId | null;
  topK: number;
  scope: RetrievalScope;
}

const DOC_STORAGE_PREFIX = "lazy-editor:doc-retrieval:";

/** Load persisted retrieval settings for a specific document (null = not stored). */
export function loadDocRetrievalSettings(filePath: string): DocRetrievalSettings | null {
  try {
    const raw = localStorage.getItem(DOC_STORAGE_PREFIX + filePath);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.topK !== "number" || !["all", "pinned"].includes(parsed.scope)) return null;
    return {
      preset: parsed.preset && parsed.preset in RETRIEVAL_PRESETS ? parsed.preset : null,
      topK: Math.max(1, Math.min(10, parsed.topK)),
      scope: parsed.scope,
    };
  } catch {
    return null;
  }
}

/** Persist retrieval settings for a specific document. */
export function saveDocRetrievalSettings(filePath: string, settings: DocRetrievalSettings): void {
  try {
    localStorage.setItem(DOC_STORAGE_PREFIX + filePath, JSON.stringify(settings));
  } catch {
    // localStorage full or disabled — silently skip
  }
}
