import { afterEach, describe, expect, it } from "vitest";
import {
  type IntegrityReminderSettings,
  computeSnoozeUntil,
  isReminderDue,
  loadReminderSettings,
  saveReminderSettings,
} from "../../lib/integrity-reminder";

// --- Due calculation ---

describe("isReminderDue", () => {
  const base: IntegrityReminderSettings = {
    enabled: true,
    frequency: "daily",
    snoozedUntil: null,
  };

  it("returns false when reminders are disabled", () => {
    expect(isReminderDue({ ...base, enabled: false }, null)).toBe(false);
  });

  it("returns true when enabled and never scanned", () => {
    expect(isReminderDue(base, null)).toBe(true);
  });

  it("returns false when last scan is within the frequency window", () => {
    const now = new Date("2026-03-12T12:00:00Z");
    const lastScan = "2026-03-12T06:00:00Z"; // 6 hours ago (< 24h)
    expect(isReminderDue(base, lastScan, now)).toBe(false);
  });

  it("returns true when last scan is past the frequency window", () => {
    const now = new Date("2026-03-13T13:00:00Z");
    const lastScan = "2026-03-12T12:00:00Z"; // 25 hours ago
    expect(isReminderDue(base, lastScan, now)).toBe(true);
  });

  it("respects every3days frequency", () => {
    const settings: IntegrityReminderSettings = { ...base, frequency: "every3days" };
    const now = new Date("2026-03-14T12:00:00Z");
    const lastScan = "2026-03-12T12:00:00Z"; // 2 days ago (< 3 days)
    expect(isReminderDue(settings, lastScan, now)).toBe(false);

    const now2 = new Date("2026-03-15T13:00:00Z"); // 3 days + 1 hour
    expect(isReminderDue(settings, lastScan, now2)).toBe(true);
  });

  it("respects weekly frequency", () => {
    const settings: IntegrityReminderSettings = { ...base, frequency: "weekly" };
    const now = new Date("2026-03-18T12:00:00Z");
    const lastScan = "2026-03-12T12:00:00Z"; // 6 days ago
    expect(isReminderDue(settings, lastScan, now)).toBe(false);

    const now2 = new Date("2026-03-19T13:00:00Z"); // 7 days + 1 hour
    expect(isReminderDue(settings, lastScan, now2)).toBe(true);
  });

  it("returns false when snoozed and snooze hasn't expired", () => {
    const settings: IntegrityReminderSettings = {
      ...base,
      snoozedUntil: "2026-03-13T12:00:00Z",
    };
    const now = new Date("2026-03-13T06:00:00Z"); // before snooze end
    expect(isReminderDue(settings, "2026-03-10T00:00:00Z", now)).toBe(false);
  });

  it("returns true when snooze has expired and scan is overdue", () => {
    const settings: IntegrityReminderSettings = {
      ...base,
      snoozedUntil: "2026-03-13T12:00:00Z",
    };
    const now = new Date("2026-03-13T13:00:00Z"); // after snooze end
    expect(isReminderDue(settings, "2026-03-10T00:00:00Z", now)).toBe(true);
  });

  it("returns false after snooze expires if scan is still recent", () => {
    const settings: IntegrityReminderSettings = {
      ...base,
      snoozedUntil: "2026-03-12T06:00:00Z",
    };
    const now = new Date("2026-03-12T12:00:00Z");
    const lastScan = "2026-03-12T08:00:00Z"; // 4 hours ago (< daily)
    expect(isReminderDue(settings, lastScan, now)).toBe(false);
  });
});

// --- Snooze ---

describe("computeSnoozeUntil", () => {
  it("returns a timestamp 24 hours from the given time", () => {
    const now = new Date("2026-03-12T12:00:00Z");
    const result = computeSnoozeUntil(now);
    expect(result).toBe("2026-03-13T12:00:00.000Z");
  });

  it("returns an ISO 8601 string", () => {
    const result = computeSnoozeUntil(new Date("2026-01-01T00:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});

// --- Persistence ---

describe("loadReminderSettings / saveReminderSettings", () => {
  const STORAGE_KEY = "lazy-editor:integrity-reminder";

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("returns defaults when nothing is stored", () => {
    const settings = loadReminderSettings();
    expect(settings).toEqual({
      enabled: false,
      frequency: "weekly",
      snoozedUntil: null,
    });
  });

  it("round-trips settings through localStorage", () => {
    const settings: IntegrityReminderSettings = {
      enabled: true,
      frequency: "every3days",
      snoozedUntil: "2026-03-13T12:00:00.000Z",
    };
    saveReminderSettings(settings);
    const loaded = loadReminderSettings();
    expect(loaded).toEqual(settings);
  });

  it("returns defaults for corrupted data", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(loadReminderSettings()).toEqual({
      enabled: false,
      frequency: "weekly",
      snoozedUntil: null,
    });
  });

  it("handles missing fields gracefully", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true }));
    const loaded = loadReminderSettings();
    expect(loaded.enabled).toBe(true);
    expect(loaded.frequency).toBe("weekly");
    expect(loaded.snoozedUntil).toBeNull();
  });

  it("rejects invalid frequency values", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true, frequency: "hourly" }));
    const loaded = loadReminderSettings();
    expect(loaded.frequency).toBe("weekly");
  });
});
