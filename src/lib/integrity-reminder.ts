/** KB integrity scan reminder — settings, due-calculation, and snooze logic. */

export type ReminderFrequency = "daily" | "every3days" | "weekly";

export interface IntegrityReminderSettings {
  enabled: boolean;
  frequency: ReminderFrequency;
  snoozedUntil: string | null; // ISO 8601 timestamp
}

const STORAGE_KEY = "lazy-editor:integrity-reminder";

const FREQUENCY_MS: Record<ReminderFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  every3days: 3 * 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const SNOOZE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const DEFAULT_REMINDER_SETTINGS: IntegrityReminderSettings = {
  enabled: false,
  frequency: "weekly",
  snoozedUntil: null,
};

export const FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  daily: "Daily",
  every3days: "Every 3 days",
  weekly: "Weekly",
};

export const FREQUENCY_IDS: ReminderFrequency[] = ["daily", "every3days", "weekly"];

// --- Persistence ---

export function loadReminderSettings(): IntegrityReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REMINDER_SETTINGS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_REMINDER_SETTINGS };
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
      frequency: FREQUENCY_IDS.includes(parsed.frequency) ? parsed.frequency : "weekly",
      snoozedUntil: typeof parsed.snoozedUntil === "string" ? parsed.snoozedUntil : null,
    };
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS };
  }
}

export function saveReminderSettings(settings: IntegrityReminderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or disabled — silently skip
  }
}

// --- Due calculation ---

/**
 * Determine whether a reminder is currently due.
 * @param settings - Current reminder settings
 * @param lastScanAt - ISO timestamp of last scan (null if never scanned)
 * @param now - Current time (injectable for testing)
 */
export function isReminderDue(
  settings: IntegrityReminderSettings,
  lastScanAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!settings.enabled) return false;

  // Check snooze
  if (settings.snoozedUntil) {
    const snoozeEnd = new Date(settings.snoozedUntil);
    if (now < snoozeEnd) return false;
  }

  // Never scanned → due immediately
  if (!lastScanAt) return true;

  const lastScan = new Date(lastScanAt);
  const interval = FREQUENCY_MS[settings.frequency];
  return now.getTime() - lastScan.getTime() >= interval;
}

// --- Snooze ---

/**
 * Compute a snoozedUntil timestamp (24h from now).
 * @param now - Current time (injectable for testing)
 */
export function computeSnoozeUntil(now: Date = new Date()): string {
  return new Date(now.getTime() + SNOOZE_MS).toISOString();
}
