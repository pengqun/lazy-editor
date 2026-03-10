/** Average adult reading speed (words per minute). */
const WPM = 200;

/** Calculate estimated reading time in minutes (minimum 1). */
export function readingTimeMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WPM));
}

/** Calculate goal progress as a percentage (0–100), clamped. */
export function goalProgress(wordCount: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((wordCount / target) * 100));
}

/** Format a progress label like "1,234 / 2,000 words (62%)". */
export function goalLabel(wordCount: number, target: number): string {
  const pct = goalProgress(wordCount, target);
  return `${wordCount.toLocaleString()} / ${target.toLocaleString()} words (${pct}%)`;
}
