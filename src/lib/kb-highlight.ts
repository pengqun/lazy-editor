/** Lightweight query-term highlighting and overlap detection for KB search results. */

const CJK_RANGE =
  /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u3000-\u303f\uff00-\uffef]/u;

/** Check if a character is CJK. */
function isCJK(ch: string): boolean {
  return CJK_RANGE.test(ch);
}

/** Tokenize a string into lowercase terms. Latin text splits on whitespace/punctuation; CJK chars become individual tokens. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let buf = "";

  for (const ch of text) {
    if (isCJK(ch)) {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      tokens.push(ch.toLowerCase());
    } else if (/\s|[.,;:!?"""''()[\]{}<>\/\\|@#$%^&*~`+=_\-]/.test(ch)) {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
    } else {
      buf += ch.toLowerCase();
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

/** Deduplicate an array preserving order. */
function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "and",
  "or",
  "but",
  "not",
  "no",
  "nor",
  "so",
  "if",
  "do",
  "did",
  "it",
  "its",
  "he",
  "she",
  "we",
  "they",
  "i",
  "me",
  "my",
  "you",
  "your",
  "his",
  "her",
  "our",
  "them",
  "this",
  "that",
  "what",
  "which",
  "how",
  "has",
  "have",
  "had",
  "will",
  "can",
  "may",
]);

/** Compute overlapping keywords between query and chunk. Returns deduplicated matches (non-stop-word tokens). */
export function findMatchedTerms(query: string, chunk: string): string[] {
  const qTokens = unique(tokenize(query)).filter(
    (t) => !STOP_WORDS.has(t) && (t.length > 1 || (t.length === 1 && isCJK(t))),
  );
  const chunkLower = chunk.toLowerCase();
  const chunkTokenSet = new Set(tokenize(chunk));

  return qTokens.filter((t) => {
    // Exact token match
    if (chunkTokenSet.has(t)) return true;
    // Substring match (helps CJK phrases and partial matches)
    return chunkLower.includes(t);
  });
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/** Split text into segments with highlight markers for matched terms. Safe — no HTML injection. */
export function highlightText(text: string, query: string): HighlightSegment[] {
  const terms = findMatchedTerms(query, text);
  if (terms.length === 0) return [{ text, highlighted: false }];

  // Build a regex that matches any of the terms (longest first to prefer longer matches)
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const idx = match.index;
    if (idx > lastIndex) {
      segments.push({ text: text.slice(lastIndex, idx), highlighted: false });
    }
    segments.push({ text: match[0], highlighted: true });
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return segments.length > 0 ? segments : [{ text, highlighted: false }];
}
