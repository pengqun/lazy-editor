import type { CitationSource } from "./tauri";

// ---------------------------------------------------------------------------
// Field options
// ---------------------------------------------------------------------------

export interface CitationFieldOptions {
  showRelevance: boolean;
  showChunkLabel: boolean;
}

export const DEFAULT_FIELD_OPTIONS: CitationFieldOptions = {
  showRelevance: true,
  showChunkLabel: true,
};

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export type CitationTemplateId = "compact" | "academic";

export interface CitationTemplate {
  id: CitationTemplateId;
  label: string;
  /** Format a single deduplicated citation entry as plain text. */
  formatEntry: (c: CitationSource, index: number, fields?: CitationFieldOptions) => string;
  /** Format a single deduplicated citation entry as HTML list item. */
  formatHtmlEntry: (c: CitationSource, index: number, fields?: CitationFieldOptions) => string;
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const compactTemplate: CitationTemplate = {
  id: "compact",
  label: "Compact",
  formatEntry: (c, i, fields = DEFAULT_FIELD_OPTIONS) => {
    const parts: string[] = [];
    if (fields.showChunkLabel) parts.push(`chunk ${c.chunkIndex + 1}`);
    if (fields.showRelevance) parts.push(`${Math.round(c.score * 100)}% relevance`);
    const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    return `[${i + 1}] ${c.documentTitle}${suffix}`;
  },
  formatHtmlEntry: (c, i, fields = DEFAULT_FIELD_OPTIONS) => {
    const parts: string[] = [];
    if (fields.showChunkLabel) parts.push(`chunk ${c.chunkIndex + 1}`);
    if (fields.showRelevance) parts.push(`${Math.round(c.score * 100)}% relevance`);
    const suffix = parts.length > 0 ? ` <em>(${parts.join(", ")})</em>` : "";
    const attrs = citationDataAttrs(c);
    return `<li><a href="#" class="citation-link" ${attrs}>[${i + 1}] ${escapeHtml(c.documentTitle)}</a>${suffix}</li>`;
  },
};

const academicTemplate: CitationTemplate = {
  id: "academic",
  label: "Academic",
  formatEntry: (c, i, fields = DEFAULT_FIELD_OPTIONS) => {
    const meta: string[] = [];
    if (fields.showChunkLabel) meta.push(`Source: chunk ${c.chunkIndex + 1}`);
    if (fields.showRelevance) meta.push(`Relevance: ${Math.round(c.score * 100)}%`);
    const metaLine = meta.length > 0 ? `\n      ${meta.join(" · ")}` : "";
    return `[${i + 1}] ${c.documentTitle}${metaLine}`;
  },
  formatHtmlEntry: (c, i, fields = DEFAULT_FIELD_OPTIONS) => {
    const meta: string[] = [];
    if (fields.showChunkLabel) meta.push(`Source: chunk ${c.chunkIndex + 1}`);
    if (fields.showRelevance) meta.push(`Relevance: ${Math.round(c.score * 100)}%`);
    const metaHtml = meta.length > 0
      ? `<br/><span style="opacity:0.7">${meta.join(" · ")}</span>`
      : "";
    const attrs = citationDataAttrs(c);
    return `<li><a href="#" class="citation-link" ${attrs}>[${i + 1}] <strong>${escapeHtml(c.documentTitle)}</strong></a>${metaHtml}</li>`;
  },
};

export const CITATION_TEMPLATES: Record<CitationTemplateId, CitationTemplate> = {
  compact: compactTemplate,
  academic: academicTemplate,
};

export const TEMPLATE_IDS: CitationTemplateId[] = ["compact", "academic"];

// ---------------------------------------------------------------------------
// Reference profile types
// ---------------------------------------------------------------------------

export interface ReferenceProfile {
  id: string;
  name: string;
  templateId: CitationTemplateId;
  fields: CitationFieldOptions;
  isBuiltin: boolean;
}

// ---------------------------------------------------------------------------
// Built-in profiles
// ---------------------------------------------------------------------------

export const BUILTIN_PROFILES: ReferenceProfile[] = [
  {
    id: "builtin:compact-default",
    name: "Compact Default",
    templateId: "compact",
    fields: { showRelevance: true, showChunkLabel: true },
    isBuiltin: true,
  },
  {
    id: "builtin:academic-full",
    name: "Academic Full",
    templateId: "academic",
    fields: { showRelevance: true, showChunkLabel: true },
    isBuiltin: true,
  },
  {
    id: "builtin:academic-minimal",
    name: "Academic Minimal",
    templateId: "academic",
    fields: { showRelevance: false, showChunkLabel: false },
    isBuiltin: true,
  },
];

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const TEMPLATE_STORAGE_KEY = "lazy-editor:citation-template";
const FIELDS_STORAGE_KEY = "lazy-editor:citation-fields";
const PROFILES_STORAGE_KEY = "lazy-editor:reference-profiles";
const ACTIVE_PROFILE_STORAGE_KEY = "lazy-editor:active-profile";

export function loadLastTemplate(): CitationTemplateId {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (raw && (raw === "compact" || raw === "academic")) return raw;
  } catch {
    // localStorage unavailable
  }
  return "compact";
}

export function saveLastTemplate(id: CitationTemplateId): void {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, id);
  } catch {
    // localStorage full or disabled — silently skip
  }
}

export function loadFieldOptions(): CitationFieldOptions {
  try {
    const raw = localStorage.getItem(FIELDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        showRelevance: typeof parsed.showRelevance === "boolean" ? parsed.showRelevance : true,
        showChunkLabel: typeof parsed.showChunkLabel === "boolean" ? parsed.showChunkLabel : true,
      };
    }
  } catch {
    // localStorage unavailable or corrupted JSON
  }
  return { ...DEFAULT_FIELD_OPTIONS };
}

export function saveFieldOptions(opts: CitationFieldOptions): void {
  try {
    localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(opts));
  } catch {
    // localStorage full or disabled — silently skip
  }
}

// ---------------------------------------------------------------------------
// Profile persistence helpers
// ---------------------------------------------------------------------------

/** Load custom (user-created) profiles from localStorage. */
export function loadCustomProfiles(): ReferenceProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (p: unknown): p is ReferenceProfile =>
            typeof p === "object" &&
            p !== null &&
            typeof (p as ReferenceProfile).id === "string" &&
            typeof (p as ReferenceProfile).name === "string" &&
            typeof (p as ReferenceProfile).templateId === "string" &&
            ((p as ReferenceProfile).templateId === "compact" ||
              (p as ReferenceProfile).templateId === "academic") &&
            typeof (p as ReferenceProfile).fields === "object" &&
            (p as ReferenceProfile).fields !== null &&
            typeof (p as ReferenceProfile).fields.showRelevance === "boolean" &&
            typeof (p as ReferenceProfile).fields.showChunkLabel === "boolean",
        ).map((p) => ({ ...p, isBuiltin: false }));
      }
    }
  } catch {
    // localStorage unavailable or corrupted JSON
  }
  return [];
}

/** Return all profiles: built-ins first, then custom. */
export function listProfiles(): ReferenceProfile[] {
  return [...BUILTIN_PROFILES, ...loadCustomProfiles()];
}

/** Find a profile by ID across built-in and custom profiles. */
export function getProfileById(id: string): ReferenceProfile | undefined {
  return listProfiles().find((p) => p.id === id);
}

/** Save a new custom profile. Returns the created profile. */
export function saveCustomProfile(
  name: string,
  templateId: CitationTemplateId,
  fields: CitationFieldOptions,
): ReferenceProfile {
  const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const profile: ReferenceProfile = {
    id,
    name,
    templateId,
    fields: { ...fields },
    isBuiltin: false,
  };
  const existing = loadCustomProfiles();
  existing.push(profile);
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // localStorage full or disabled — silently skip
  }
  return profile;
}

/** Delete a custom profile by ID. Returns true if the profile was found and deleted. */
export function deleteCustomProfile(id: string): boolean {
  // Prevent deletion of built-in profiles
  if (BUILTIN_PROFILES.some((p) => p.id === id)) return false;
  const existing = loadCustomProfiles();
  const filtered = existing.filter((p) => p.id !== id);
  if (filtered.length === existing.length) return false;
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // localStorage full or disabled — silently skip
  }
  return true;
}

/** Load the active profile ID from localStorage. Returns null if none set. */
export function loadActiveProfileId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    if (raw && typeof raw === "string") return raw;
  } catch {
    // localStorage unavailable
  }
  return null;
}

/** Save the active profile ID to localStorage. */
export function saveActiveProfileId(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    } else {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
    }
  } catch {
    // localStorage full or disabled — silently skip
  }
}

/**
 * Load citation settings, using the active profile if one is set,
 * otherwise falling back to legacy per-field settings for backward
 * compatibility. Returns the resolved template ID, field options,
 * and the active profile ID (if any).
 */
export function loadCitationSettings(): {
  templateId: CitationTemplateId;
  fields: CitationFieldOptions;
  activeProfileId: string | null;
} {
  const profileId = loadActiveProfileId();
  if (profileId) {
    const profile = getProfileById(profileId);
    if (profile) {
      return {
        templateId: profile.templateId,
        fields: { ...profile.fields },
        activeProfileId: profile.id,
      };
    }
  }
  // Fallback to legacy settings for backward compatibility
  return {
    templateId: loadLastTemplate(),
    fields: loadFieldOptions(),
    activeProfileId: null,
  };
}

/**
 * Save citation settings. If a profile ID is provided, persist it as the
 * active profile. Also mirrors the template/field values to legacy keys
 * so older reads still work.
 */
export function saveCitationSettings(
  templateId: CitationTemplateId,
  fields: CitationFieldOptions,
  profileId: string | null = null,
): void {
  saveLastTemplate(templateId);
  saveFieldOptions(fields);
  saveActiveProfileId(profileId);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Deduplicate citations by document ID, keeping the highest-scoring entry per doc. */
export function deduplicateCitations(citations: CitationSource[]): CitationSource[] {
  const byDoc = new Map<number, CitationSource>();
  for (const c of citations) {
    const existing = byDoc.get(c.documentId);
    if (!existing || c.score > existing.score) {
      byDoc.set(c.documentId, c);
    }
  }
  return Array.from(byDoc.values());
}

// ---------------------------------------------------------------------------
// Formatting (template-aware)
// ---------------------------------------------------------------------------

/**
 * Format deduplicated citations as a Markdown-friendly reference block.
 * Defaults to compact template for backward compatibility.
 */
export function formatReferenceBlock(
  citations: CitationSource[],
  templateId: CitationTemplateId = "compact",
  fields: CitationFieldOptions = DEFAULT_FIELD_OPTIONS,
): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const tmpl = CITATION_TEMPLATES[templateId];
  const lines = deduped.map((c, i) => tmpl.formatEntry(c, i, fields));
  return `---\n**References**\n${lines.join("\n")}`;
}

/**
 * Build TipTap-compatible HTML for the reference block.
 * Defaults to compact template for backward compatibility.
 * When `query` is provided, it is embedded as a `data-query` attribute on the
 * reference list so citation deep-links can restore highlight state even after
 * the originating AI action is no longer active.
 */
export function buildReferenceHtml(
  citations: CitationSource[],
  templateId: CitationTemplateId = "compact",
  fields: CitationFieldOptions = DEFAULT_FIELD_OPTIONS,
  query?: string,
): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const tmpl = CITATION_TEMPLATES[templateId];
  const items = deduped.map((c, i) => tmpl.formatHtmlEntry(c, i, fields)).join("");
  const queryAttr = query ? ` data-query="${escapeHtml(query)}"` : "";
  return `<hr><p><strong>References</strong></p><ol class="citation-references"${queryAttr}>${items}</ol>`;
}

// ---------------------------------------------------------------------------
// Clipboard export (plain text)
// ---------------------------------------------------------------------------

/**
 * Copy formatted references to the system clipboard without inserting into
 * the document. Returns the plain-text string that was copied, or empty
 * string if there were no citations.
 */
export async function copyReferencesToClipboard(
  citations: CitationSource[],
  templateId: CitationTemplateId = "compact",
  fields: CitationFieldOptions = DEFAULT_FIELD_OPTIONS,
): Promise<string> {
  const text = formatReferenceBlock(citations, templateId, fields);
  if (!text) return "";
  await navigator.clipboard.writeText(text);
  return text;
}

// ---------------------------------------------------------------------------
// Deep-link helpers
// ---------------------------------------------------------------------------

/** CSS selector for citation deep-link anchors inside the editor. */
export const CITATION_LINK_SELECTOR = "a.citation-link[data-chunk-id]";

/** Build data-* attribute string for a citation anchor element. */
export function citationDataAttrs(c: CitationSource): string {
  return [
    `data-chunk-id="${c.chunkId}"`,
    `data-document-id="${c.documentId}"`,
    `data-score="${c.score}"`,
  ].join(" ");
}

/**
 * Parse deep-link metadata from a citation anchor element.
 * Returns null if the required attributes are missing.
 */
export function parseCitationElement(el: HTMLElement): {
  chunkId: number;
  documentId: number;
  score: number;
} | null {
  const chunkId = Number(el.dataset.chunkId);
  const documentId = Number(el.dataset.documentId);
  const score = Number(el.dataset.score);
  if (Number.isNaN(chunkId) || Number.isNaN(documentId)) return null;
  return { chunkId, documentId, score: Number.isNaN(score) ? 0 : score };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
