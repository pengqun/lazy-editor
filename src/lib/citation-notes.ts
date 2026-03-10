import type { CitationSource } from "./tauri";

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export type CitationTemplateId = "compact" | "academic";

export interface CitationTemplate {
  id: CitationTemplateId;
  label: string;
  /** Format a single deduplicated citation entry as plain text. */
  formatEntry: (c: CitationSource, index: number) => string;
  /** Format a single deduplicated citation entry as HTML list item. */
  formatHtmlEntry: (c: CitationSource, index: number) => string;
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const compactTemplate: CitationTemplate = {
  id: "compact",
  label: "Compact",
  formatEntry: (c, i) => {
    const pct = Math.round(c.score * 100);
    return `[${i + 1}] ${c.documentTitle} (chunk ${c.chunkIndex + 1}, ${pct}% relevance)`;
  },
  formatHtmlEntry: (c, i) => {
    const pct = Math.round(c.score * 100);
    return `<li>[${i + 1}] ${escapeHtml(c.documentTitle)} <em>(chunk ${c.chunkIndex + 1}, ${pct}% relevance)</em></li>`;
  },
};

const academicTemplate: CitationTemplate = {
  id: "academic",
  label: "Academic",
  formatEntry: (c, i) => {
    const pct = Math.round(c.score * 100);
    return `[${i + 1}] ${c.documentTitle}\n      Source: chunk ${c.chunkIndex + 1} · Relevance: ${pct}%`;
  },
  formatHtmlEntry: (c, i) => {
    const pct = Math.round(c.score * 100);
    return `<li>[${i + 1}] <strong>${escapeHtml(c.documentTitle)}</strong><br/><span style="opacity:0.7">Source: chunk ${c.chunkIndex + 1} · Relevance: ${pct}%</span></li>`;
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
): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const tmpl = CITATION_TEMPLATES[templateId];
  const lines = deduped.map((c, i) => tmpl.formatEntry(c, i));
  return `---\n**References**\n${lines.join("\n")}`;
}

/**
 * Build TipTap-compatible HTML for the reference block.
 * Defaults to compact template for backward compatibility.
 */
export function buildReferenceHtml(
  citations: CitationSource[],
  templateId: CitationTemplateId = "compact",
): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const tmpl = CITATION_TEMPLATES[templateId];
  const items = deduped.map((c, i) => tmpl.formatHtmlEntry(c, i)).join("");
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
): Promise<string> {
  const text = formatReferenceBlock(citations, templateId);
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
