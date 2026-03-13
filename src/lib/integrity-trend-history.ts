import type { IntegrityScanSnapshot } from "@/stores/knowledge";

const STORAGE_PREFIX = "lazyeditor.integrity.trend.v1:";
const DEFAULT_MAX_KEEP = 60;

export interface IntegrityTrendPoint {
  scannedAt: string;
  missing: number;
  moved: number;
  invalid: number;
}

function getStorageKey(workspacePath: string | null): string {
  return `${STORAGE_PREFIX}${workspacePath ?? "global"}`;
}

function sanitizeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function normalizeSnapshot(snapshot: IntegrityScanSnapshot): IntegrityTrendPoint {
  const raw = snapshot as IntegrityScanSnapshot & { invalid?: number };
  return {
    scannedAt: snapshot.scannedAt,
    missing: sanitizeNumber(snapshot.missing),
    moved: sanitizeNumber(snapshot.moved),
    invalid: sanitizeNumber(raw.invalid),
  };
}

function parseStored(raw: string | null): IntegrityTrendPoint[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        scannedAt: typeof item?.scannedAt === "string" ? item.scannedAt : "",
        missing: sanitizeNumber(item?.missing),
        moved: sanitizeNumber(item?.moved),
        invalid: sanitizeNumber(item?.invalid),
      }))
      .filter((item) => item.scannedAt.length > 0);
  } catch {
    return [];
  }
}

export function loadIntegrityTrendHistory(workspacePath: string | null): IntegrityTrendPoint[] {
  try {
    const raw = localStorage.getItem(getStorageKey(workspacePath));
    return parseStored(raw);
  } catch {
    return [];
  }
}

/** Merge latest backend snapshots into local trend history, dedupe by scannedAt, persist and return DESC order. */
export function syncIntegrityTrendHistory(
  workspacePath: string | null,
  snapshots: IntegrityScanSnapshot[],
  maxKeep = DEFAULT_MAX_KEEP,
): IntegrityTrendPoint[] {
  const existing = loadIntegrityTrendHistory(workspacePath);
  const byScannedAt = new Map<string, IntegrityTrendPoint>();

  for (const point of existing) byScannedAt.set(point.scannedAt, point);
  for (const snapshot of snapshots) {
    const point = normalizeSnapshot(snapshot);
    byScannedAt.set(point.scannedAt, point);
  }

  const merged = Array.from(byScannedAt.values())
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
    .slice(0, Math.max(1, maxKeep));

  try {
    localStorage.setItem(getStorageKey(workspacePath), JSON.stringify(merged));
  } catch {
    // localStorage full/disabled
  }

  return merged;
}

export function toSparkline(values: number[]): string {
  if (values.length === 0) return "-";
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return values.map(() => bars[min > 0 ? 3 : 0]).join("");
  return values
    .map((v) => {
      const idx = Math.round(((v - min) / (max - min)) * (bars.length - 1));
      return bars[Math.max(0, Math.min(bars.length - 1, idx))];
    })
    .join("");
}
