import { invoke } from "@tauri-apps/api/core";
import {
  type BatchExecutionCallbacks,
  buildBatchFixPlan,
  executeBatchFixPlan,
  executeBatchStep,
  mergeRetriedResult,
} from "../../lib/integrity-batch-plan";
import {
  buildBatchImpactSummary,
  loadBatchImpactSummary,
  saveBatchImpactSummary,
} from "../../lib/integrity-batch-impact";
import { toast } from "../toast";
import { extractErrorMessage } from "./integrity-utils";
import type { IntegrityReport, KnowledgeState } from "./types";

const inFlightBatchStepRetries = new Set<string>();

type BatchStateSlice = Pick<KnowledgeState,
  "batchFixPlan"
  | "batchLastPlan"
  | "batchExecuting"
  | "batchStepStatuses"
  | "batchExecutionLog"
  | "lastBatchImpact"
>;

type BatchActionSlice = Pick<KnowledgeState,
  "clearHealthCheck"
  | "buildBatchPlan"
  | "clearBatchPlan"
  | "confirmBatchPlan"
  | "retryBatchStep"
  | "clearBatchLog"
>;

function buildBatchCallbacks(
  integrityReport: IntegrityReport | null,
  setReminderSettings: KnowledgeState["setReminderSettings"],
): BatchExecutionCallbacks {
  const movedEntries = (integrityReport?.entries ?? [])
    .filter((e) => e.status === "moved")
    .map((e) => ({ id: e.id, movedCandidate: e.movedCandidate }));

  return {
    relinkDocument: async (id, newPath) => {
      await invoke("relink_kb_document", { id, newPath });
    },
    removeStaleDocuments: async (ids) => {
      for (const id of ids) {
        await invoke("remove_kb_document", { id });
      }
    },
    enableReminders: () => setReminderSettings({ enabled: true }),
    adjustFrequency: (freq) => setReminderSettings({ frequency: freq as "daily" | "every3days" | "weekly" }),
    movedEntries,
  };
}

export function createBatchStateSlice(): BatchStateSlice {
  return {
    batchFixPlan: null,
    batchLastPlan: null,
    batchExecuting: false,
    batchStepStatuses: {},
    batchExecutionLog: null,
    lastBatchImpact: loadBatchImpactSummary(null),
  };
}

export function createBatchActionSlice(
  set: (partial: Partial<KnowledgeState> | ((state: KnowledgeState) => Partial<KnowledgeState>)) => void,
  get: () => KnowledgeState,
): BatchActionSlice {
  return {
    clearHealthCheck: () =>
      set({ healthCheckReport: null, batchFixPlan: null, batchLastPlan: null, batchExecutionLog: null, batchStepStatuses: {} }),

    buildBatchPlan: () => {
      const { healthCheckReport } = get();
      if (!healthCheckReport) return;
      const plan = buildBatchFixPlan(healthCheckReport);
      set({ batchFixPlan: plan, batchExecutionLog: null, batchStepStatuses: {} });
    },

    clearBatchPlan: () => set({ batchFixPlan: null }),

    confirmBatchPlan: async () => {
      const { batchFixPlan, integrityReport, setReminderSettings } = get();
      if (!batchFixPlan) return;

      const statuses: Record<string, KnowledgeState["batchStepStatuses"][string]> = {};
      for (const step of batchFixPlan.steps) statuses[step.stepId] = "pending";

      set({ batchExecuting: true, batchStepStatuses: statuses });
      try {
        const callbacks = buildBatchCallbacks(integrityReport, setReminderSettings);
        const log = await executeBatchFixPlan(batchFixPlan, callbacks, {
          onStepStatusChange: (stepId, status) => {
            set((state) => ({ batchStepStatuses: { ...state.batchStepStatuses, [stepId]: status } }));
          },
        });

        const summary = buildBatchImpactSummary(log);
        saveBatchImpactSummary(get()._workspacePath, summary);
        set({
          batchExecutionLog: log,
          batchLastPlan: batchFixPlan,
          batchFixPlan: null,
          batchExecuting: false,
          lastBatchImpact: summary,
        });

        const { success, failed, skipped, itemChanges } = log.summary;
        if (failed > 0) {
          toast.error(`Batch: ${success} ok, ${failed} failed, ${skipped} skipped · ${itemChanges.success} items changed`);
        } else {
          toast.success(`Batch complete: ${success} applied, ${skipped} skipped · ${itemChanges.success} items changed`);
        }

        await get().loadDocuments();
        await get().checkIntegrity();
      } catch (err) {
        toast.error(`Batch execution failed: ${extractErrorMessage(err)}`);
        set({ batchExecuting: false });
      }
    },

    retryBatchStep: async (stepId: string) => {
      const { batchExecutionLog, batchLastPlan, integrityReport, setReminderSettings } = get();
      if (!batchExecutionLog || !batchLastPlan || inFlightBatchStepRetries.has(stepId)) return;

      const previous = batchExecutionLog.results.find((r) => r.stepId === stepId);
      const step = batchLastPlan.steps.find((s) => s.stepId === stepId);
      if (!previous || !step || previous.outcome !== "failed") return;

      inFlightBatchStepRetries.add(stepId);
      try {
        const callbacks = buildBatchCallbacks(integrityReport, setReminderSettings);
        const retried = await executeBatchStep(step, callbacks, {
          onStepStatusChange: (id, status) => {
            set((state) => ({ batchStepStatuses: { ...state.batchStepStatuses, [id]: status } }));
          },
        }, previous.attempts + 1);

        const merged = mergeRetriedResult(batchExecutionLog, retried);
        const summary = buildBatchImpactSummary(merged);
        saveBatchImpactSummary(get()._workspacePath, summary);
        set({ batchExecutionLog: merged, lastBatchImpact: summary });

        if (retried.outcome === "success") {
          toast.success(`Retried ${stepId.replace("step-", "")}: success`);
          await get().loadDocuments();
          await get().checkIntegrity();
        } else {
          toast.error(`Retried ${stepId.replace("step-", "")}: ${retried.message}`);
        }
      } finally {
        inFlightBatchStepRetries.delete(stepId);
      }
    },

    clearBatchLog: () => set({ batchExecutionLog: null, batchStepStatuses: {} }),
  };
}
