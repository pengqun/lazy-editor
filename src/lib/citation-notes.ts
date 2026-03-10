import type { CitationSource } from "./tauri";

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

/**
 * Format deduplicated citations as a Markdown-friendly reference block.
 * Each entry gets a stable number, document title, chunk position, and relevance.
 *
 * Example output:
 * ---
 * **References**
 * [1] My Paper (chunk 3, 87% relevance)
 * [2] Another Doc (chunk 1, 72% relevance)
 */
export function formatReferenceBlock(citations: CitationSource[]): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const lines = deduped.map((c, i) => {
    const pct = Math.round(c.score * 100);
    return `[${i + 1}] ${c.documentTitle} (chunk ${c.chunkIndex + 1}, ${pct}% relevance)`;
  });

  return `---\n**References**\n${lines.join("\n")}`;
}

/**
 * Build TipTap-compatible HTML for the reference block.
 * Uses a horizontal rule, bold heading, and numbered list.
 */
export function buildReferenceHtml(citations: CitationSource[]): string {
  const deduped = deduplicateCitations(citations);
  if (deduped.length === 0) return "";

  const items = deduped
    .map((c, i) => {
      const pct = Math.round(c.score * 100);
      return `<li>[${i + 1}] ${escapeHtml(c.documentTitle)} <em>(chunk ${c.chunkIndex + 1}, ${pct}% relevance)</em></li>`;
    })
    .join("");

  return `<hr><p><strong>References</strong></p><ol>${items}</ol>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
