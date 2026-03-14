import type { IntegrityScanSnapshot } from "./types";

/** Extract a human-readable message from an unknown error value. */
export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Get the timestamp of the most recent scan, or null if history is empty. */
export function lastScanAt(history: IntegrityScanSnapshot[]): string | null {
  return history.length > 0 ? history[0].scannedAt : null;
}

/**
 * Normalize a backend history response to a guaranteed array.
 * Guards against unexpected null/undefined from invoke().
 */
export function ensureHistoryArray(history: unknown): IntegrityScanSnapshot[] {
  return Array.isArray(history) ? history : [];
}
