/** KB integrity scan health — coverage metrics, streak, and status tier computation. */

import type { IntegrityScanSnapshot } from "@/stores/knowledge";

// --- Types ---

export type HealthTier = "good" | "warning" | "poor";

export interface ScanCoverageMetrics {
  /** Number of scans in the last 7 days. */
  scansLast7d: number;
  /** Number of scans in the last 30 days. */
  scansLast30d: number;
  /** Age of the most recent scan in milliseconds (null if never scanned). */
  latestScanAgeMs: number | null;
  /** Consecutive days (ending today/yesterday) with at least one scan. */
  streak: number;
}

export interface HealthThresholds {
  /** Minimum scans in 7d to be "good" (default: 2). */
  good7d: number;
  /** Minimum scans in 7d to be "warning" (default: 1). */
  warning7d: number;
  /** Maximum age in ms for latest scan to be "good" (default: 7 days). */
  goodMaxAgeMs: number;
  /** Maximum age in ms for latest scan to be "warning" (default: 14 days). */
  warningMaxAgeMs: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  good7d: 2,
  warning7d: 1,
  goodMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  warningMaxAgeMs: 14 * 24 * 60 * 60 * 1000,
};

// --- Computation ---

/**
 * Compute scan coverage metrics from history snapshots.
 * @param history - Scan snapshots (newest first, as returned by the store).
 * @param now - Current time (injectable for testing).
 */
export function computeScanCoverage(
  history: IntegrityScanSnapshot[],
  now: Date = new Date(),
): ScanCoverageMetrics {
  if (history.length === 0) {
    return { scansLast7d: 0, scansLast30d: 0, latestScanAgeMs: null, streak: 0 };
  }

  const nowMs = now.getTime();
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;

  let scansLast7d = 0;
  let scansLast30d = 0;

  const scanTimestamps: number[] = [];

  for (const snap of history) {
    const scanMs = new Date(snap.scannedAt + "Z").getTime();
    const age = nowMs - scanMs;
    if (age <= ms7d) scansLast7d++;
    if (age <= ms30d) scansLast30d++;
    scanTimestamps.push(scanMs);
  }

  // Latest scan age
  const latestMs = scanTimestamps[0]; // history is newest-first
  const latestScanAgeMs = nowMs - latestMs;

  // Streak: consecutive days ending today or yesterday with >= 1 scan
  const streak = computeStreak(scanTimestamps, now);

  return { scansLast7d, scansLast30d, latestScanAgeMs, streak };
}

/**
 * Compute consecutive-day streak from scan timestamps.
 * A streak starts from today (or yesterday if no scan today) and counts
 * consecutive calendar days with at least one scan.
 */
export function computeStreak(scanTimestamps: number[], now: Date = new Date()): number {
  if (scanTimestamps.length === 0) return 0;

  // Collect unique scan days (as date strings in UTC)
  const scanDays = new Set<string>();
  for (const ts of scanTimestamps) {
    const d = new Date(ts);
    scanDays.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  }

  // Start from today, check consecutive days backward
  const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

  let streak = 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  // Allow starting from today or yesterday
  let offset = scanDays.has(todayKey) ? 0 : 1;

  for (let i = offset; ; i++) {
    const checkMs = startOfToday - i * dayMs;
    const d = new Date(checkMs);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (scanDays.has(key)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Determine health tier based on coverage metrics and thresholds.
 */
export function computeHealthTier(
  metrics: ScanCoverageMetrics,
  thresholds: HealthThresholds = DEFAULT_THRESHOLDS,
): HealthTier {
  // Never scanned → poor
  if (metrics.latestScanAgeMs === null) return "poor";

  // Check age first (most impactful signal)
  if (metrics.latestScanAgeMs > thresholds.warningMaxAgeMs) return "poor";

  // Check 7d coverage
  if (metrics.scansLast7d >= thresholds.good7d && metrics.latestScanAgeMs <= thresholds.goodMaxAgeMs) {
    return "good";
  }

  if (metrics.scansLast7d >= thresholds.warning7d || metrics.latestScanAgeMs <= thresholds.goodMaxAgeMs) {
    return "warning";
  }

  return "poor";
}

/**
 * Format a duration in ms to a human-readable age string.
 */
export function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

// --- User-facing threshold settings ---

/**
 * User-configurable health threshold settings (days-based for UI).
 * Converted to internal HealthThresholds for tier computation.
 */
export interface HealthThresholdSettings {
  /** Min scans in 7 days for "good" tier (default: 2, range: 1–10). */
  goodMinScans7d: number;
  /** Max latest scan age in days for "good" tier (default: 7, range: 1–30). */
  goodMaxAgeDays: number;
  /** Max latest scan age in days before "poor" tier (default: 14, range: 2–60). */
  poorMaxAgeDays: number;
}

export const DEFAULT_THRESHOLD_SETTINGS: HealthThresholdSettings = {
  goodMinScans7d: 2,
  goodMaxAgeDays: 7,
  poorMaxAgeDays: 14,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Clamp and validate user threshold settings to safe bounds. */
export function clampThresholdSettings(raw: HealthThresholdSettings): HealthThresholdSettings {
  const goodMinScans7d = Math.max(1, Math.min(10, Math.round(raw.goodMinScans7d) || 1));
  const goodMaxAgeDays = Math.max(1, Math.min(30, Math.round(raw.goodMaxAgeDays) || 1));
  // poorMaxAgeDays must be > goodMaxAgeDays
  const poorMin = goodMaxAgeDays + 1;
  const poorMaxAgeDays = Math.max(poorMin, Math.min(60, Math.round(raw.poorMaxAgeDays) || poorMin));
  return { goodMinScans7d, goodMaxAgeDays, poorMaxAgeDays };
}

/** Convert user-facing settings to internal HealthThresholds. */
export function toHealthThresholds(settings: HealthThresholdSettings): HealthThresholds {
  return {
    good7d: settings.goodMinScans7d,
    warning7d: 1, // fixed internal value
    goodMaxAgeMs: settings.goodMaxAgeDays * DAY_MS,
    warningMaxAgeMs: settings.poorMaxAgeDays * DAY_MS,
  };
}

// --- Threshold persistence ---

const THRESHOLD_STORAGE_KEY = "lazy-editor:integrity-health-thresholds";

export function loadThresholdSettings(): HealthThresholdSettings {
  try {
    const raw = localStorage.getItem(THRESHOLD_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLD_SETTINGS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_THRESHOLD_SETTINGS };
    return clampThresholdSettings({
      goodMinScans7d: typeof parsed.goodMinScans7d === "number" ? parsed.goodMinScans7d : DEFAULT_THRESHOLD_SETTINGS.goodMinScans7d,
      goodMaxAgeDays: typeof parsed.goodMaxAgeDays === "number" ? parsed.goodMaxAgeDays : DEFAULT_THRESHOLD_SETTINGS.goodMaxAgeDays,
      poorMaxAgeDays: typeof parsed.poorMaxAgeDays === "number" ? parsed.poorMaxAgeDays : DEFAULT_THRESHOLD_SETTINGS.poorMaxAgeDays,
    });
  } catch {
    return { ...DEFAULT_THRESHOLD_SETTINGS };
  }
}

export function saveThresholdSettings(settings: HealthThresholdSettings): void {
  try {
    localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or disabled — silently skip
  }
}

// --- Tier display helpers ---

export const TIER_LABELS: Record<HealthTier, string> = {
  good: "Good",
  warning: "Fair",
  poor: "Poor",
};

export const TIER_COLORS: Record<HealthTier, string> = {
  good: "text-emerald-400",
  warning: "text-amber-400",
  poor: "text-red-400",
};

export const TIER_BG_COLORS: Record<HealthTier, string> = {
  good: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
  poor: "bg-red-500/10",
};
