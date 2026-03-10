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
    return `<li>[${i + 1}] ${escapeHtml(c.documentTitle)}${suffix}</li>`;
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
    return `<li>[${i + 1}] <strong>${escapeHtml(c.documentTitle)}</strong>${metaHtml}</li>`;
  },
};

export const CITATION_TEMPLATES: Record<CitationTemplateId, CitationTemplate> = {
  compact: compactTemplate,
  academic: academicTemplate,
};

export const TEMPLATE_IDS: CitationTemplateId[] = ["compact", "academic"];

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const TEMPLATE_STORAGE_KEY = "lazy-editor:citation-template";
const FIELDS_STORAGE_KEY = "lazy-editor:citation-fields";

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
 */
export function buildReferenceHtml(
  citations: CitationSource[],
  templateId: CitationTemplateId = "compact",
  fields: CitationFieldOptions = DEFAULT_FIELD_OPTIONS,
): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const tmpl = CITATION_TEMPLATES[templateId];
  const items = deduped.map((c, i) => tmpl.formatHtmlEntry(c, i, fields)).join("");
  return `<hr><p><strong>References</strong></p><ol>${items}</ol>`;
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
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
