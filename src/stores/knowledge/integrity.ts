import { invoke } from "@tauri-apps/api/core";
import {
  type HealthThresholdSettings,
  type ThresholdSource,
  DEFAULT_THRESHOLD_SETTINGS,
  clampThresholdSettings,
  loadThresholdSettings,
  removeWorkspaceThresholdSettings,
  resolveThresholdSettings,
  saveThresholdSettings,
  saveWorkspaceThresholdSettings,
  toHealthThresholds,
} from "../../lib/integrity-health";
import {
  applyThresholdConfig,
  buildThresholdExportPayload,
  parseThresholdConfig,
  serializeThresholdConfig,
} from "../../lib/integrity-threshold-io";
import {
  type IntegrityReminderSettings,
  computeSnoozeUntil,
  isReminderDue,
  loadReminderSettings,
  saveReminderSettings,
} from "../../lib/integrity-reminder";
import { buildHealthCheckReport } from "../../lib/integrity-healthcheck";
import { loadIntegrityTrendHistory, syncIntegrityTrendHistory } from "../../lib/integrity-trend-history";
import { toast } from "../toast";
import { ensureHistoryArray, extractErrorMessage, lastScanAt } from "./integrity-utils";
import type { IntegrityReport, IntegrityScanSnapshot, KnowledgeState } from "./types";

export type IntegrityStateSlice = Pick<KnowledgeState,
  "integrityReport"
  | "integrityLoading"
  | "integrityHistory"
  | "integrityTrendHistory"
  | "checkIntegrity"
  | "relinkDocument"
  | "removeStaleDocuments"
  | "clearIntegrity"
  | "loadIntegrityHistory"
  | "reminderSettings"
  | "reminderDue"
  | "setReminderSettings"
  | "snoozeReminder"
  | "refreshReminderDue"
  | "healthThresholds"
  | "healthThresholdSource"
  | "setHealthThresholds"
  | "resetHealthThresholds"
  | "getHealthThresholds"
  | "saveThresholdsForWorkspace"
  | "resetWorkspaceThresholds"
  | "exportThresholdConfig"
  | "importThresholdConfig"
  | "healthCheckReport"
  | "healthCheckLoading"
  | "runHealthCheck"
>;

export function createIntegrityStateSlice(
  set: (partial: Partial<KnowledgeState> | ((state: KnowledgeState) => Partial<KnowledgeState>)) => void,
  get: () => KnowledgeState,
): IntegrityStateSlice {
  return {
    integrityReport: null,
    integrityLoading: false,
    integrityHistory: [],
    integrityTrendHistory: loadIntegrityTrendHistory(null),

    checkIntegrity: async () => {
      set({ integrityLoading: true });
      try {
        const report = await invoke<IntegrityReport>("check_kb_integrity");
        set({ integrityReport: report, integrityLoading: false });
        // Refresh history after scan (auto-saved by backend)
        await get().loadIntegrityHistory();
      } catch (err) {
        const message = extractErrorMessage(err);
        console.error("Failed to check KB integrity:", message);
        toast.error(`Integrity check failed: ${message}`);
        set({ integrityLoading: false });
      }
    },

    relinkDocument: async (id, newPath) => {
      try {
        await invoke("relink_kb_document", { id, newPath });
        toast.success("Document relinked successfully");
        // Re-run integrity check and refresh document list
        await get().checkIntegrity();
        await get().loadDocuments();
      } catch (err) {
        const message = extractErrorMessage(err);
        console.error("Failed to relink document:", message);
        toast.error(`Relink failed: ${message}`);
      }
    },

    removeStaleDocuments: async (ids) => {
      try {
        for (const id of ids) {
          await invoke("remove_kb_document", { id });
        }
        toast.success(`Removed ${ids.length} stale document${ids.length > 1 ? "s" : ""}`);
        await get().loadDocuments();
        await get().checkIntegrity();
      } catch (err) {
        const message = extractErrorMessage(err);
        console.error("Failed to remove stale documents:", message);
        toast.error(`Remove failed: ${message}`);
      }
    },

    clearIntegrity: () => set({ integrityReport: null }),

    loadIntegrityHistory: async () => {
      try {
        const history = await invoke<IntegrityScanSnapshot[]>("get_integrity_history");
        const safeHistory = ensureHistoryArray(history);
        const trendHistory = syncIntegrityTrendHistory(get()._workspacePath, safeHistory);
        set({ integrityHistory: safeHistory, integrityTrendHistory: trendHistory });
        // Re-evaluate reminder whenever history changes
        set({ reminderDue: isReminderDue(get().reminderSettings, lastScanAt(safeHistory)) });
      } catch (err) {
        console.error("Failed to load integrity history:", err);
      }
    },

    reminderSettings: loadReminderSettings(),
    reminderDue: false,

    setReminderSettings: (patch) => {
      const current = get().reminderSettings;
      const updated: IntegrityReminderSettings = {
        ...current,
        ...patch,
        // Clear snooze when toggling enabled or changing frequency
        snoozedUntil: null,
      };
      saveReminderSettings(updated);
      set({
        reminderSettings: updated,
        reminderDue: isReminderDue(updated, lastScanAt(get().integrityHistory)),
      });
    },

    snoozeReminder: () => {
      const current = get().reminderSettings;
      const updated: IntegrityReminderSettings = {
        ...current,
        snoozedUntil: computeSnoozeUntil(),
      };
      saveReminderSettings(updated);
      set({ reminderSettings: updated, reminderDue: false });
    },

    refreshReminderDue: () => {
      const { reminderSettings, integrityHistory } = get();
      set({ reminderDue: isReminderDue(reminderSettings, lastScanAt(integrityHistory)) });
    },

    healthThresholds: loadThresholdSettings(),
    healthThresholdSource: "global" as ThresholdSource,

    setHealthThresholds: (patch) => {
      const current = get().healthThresholds;
      const updated = clampThresholdSettings({ ...current, ...patch });
      const { _workspacePath, healthThresholdSource } = get();
      // Persist to the active source layer
      if (healthThresholdSource === "workspace" && _workspacePath) {
        saveWorkspaceThresholdSettings(_workspacePath, updated);
      } else {
        saveThresholdSettings(updated);
      }
      set({ healthThresholds: updated });
    },

    resetHealthThresholds: () => {
      const defaults = { ...DEFAULT_THRESHOLD_SETTINGS };
      saveThresholdSettings(defaults);
      // Also clear workspace override if active
      const { _workspacePath } = get();
      if (_workspacePath) {
        removeWorkspaceThresholdSettings(_workspacePath);
      }
      set({ healthThresholds: defaults, healthThresholdSource: "global" });
    },

    getHealthThresholds: () => toHealthThresholds(get().healthThresholds),

    saveThresholdsForWorkspace: () => {
      const { _workspacePath, healthThresholds } = get();
      if (!_workspacePath) return;
      saveWorkspaceThresholdSettings(_workspacePath, healthThresholds);
      set({ healthThresholdSource: "workspace" });
    },

    resetWorkspaceThresholds: () => {
      const { _workspacePath } = get();
      if (!_workspacePath) return;
      removeWorkspaceThresholdSettings(_workspacePath);
      // Fall back to global
      const globalSettings = loadThresholdSettings();
      set({ healthThresholds: globalSettings, healthThresholdSource: "global" });
    },

    exportThresholdConfig: () => {
      const payload = buildThresholdExportPayload();
      return serializeThresholdConfig(payload);
    },

    importThresholdConfig: (jsonString) => {
      const result = parseThresholdConfig(jsonString);
      if (!result.ok) return result.error;
      applyThresholdConfig(result.payload);
      // Re-resolve for current workspace
      const { _workspacePath } = get();
      const { settings, source } = resolveThresholdSettings(_workspacePath);
      set({ healthThresholds: settings, healthThresholdSource: source });
      return null;
    },

    healthCheckReport: null,
    healthCheckLoading: false,

    runHealthCheck: async () => {
      set({ healthCheckLoading: true, healthCheckReport: null });
      try {
        // 1. Run integrity scan (persists snapshot + refreshes history)
        const report = await invoke<IntegrityReport>("check_kb_integrity");
        set({ integrityReport: report, integrityLoading: false });

        // 2. Refresh history (auto-saved by backend)
        const history = await invoke<IntegrityScanSnapshot[]>("get_integrity_history");
        const safeHistory = ensureHistoryArray(history);
        const trendHistory = syncIntegrityTrendHistory(get()._workspacePath, safeHistory);
        set({ integrityHistory: safeHistory, integrityTrendHistory: trendHistory });

        // Re-evaluate reminder
        set({ reminderDue: isReminderDue(get().reminderSettings, lastScanAt(safeHistory)) });

        // 3. Build health check report
        const { healthThresholds, reminderSettings } = get();
        const hcReport = buildHealthCheckReport(
          report,
          safeHistory,
          healthThresholds,
          reminderSettings,
        );

        set({ healthCheckReport: hcReport, healthCheckLoading: false });
        toast.success("Health check complete");
      } catch (err) {
        const message = extractErrorMessage(err);
        console.error("Health check failed:", message);
        toast.error(`Health check failed: ${message}`);
        set({ healthCheckLoading: false });
      }
    },
  };
}
