import {
  Activity,
  CheckCircle,
  Download,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  type DiagnosticsInfo,
  type HealthReport,
  collectDiagnostics,
  exportDiagnostics,
  runHealthCheck,
} from "../../lib/diagnostics";
import { type UpdateState, checkForAppUpdate, getUpdateState } from "../../lib/updater";
import { toast } from "../../stores/toast";

/** Map raw subsystem names to human-friendly labels. */
const subsystemLabels: Record<string, string> = {
  workspace: "Workspace",
  database: "Database",
  embedder: "Embedder",
  settings: "Settings",
  ai_provider: "AI Provider",
};

function formatSubsystemName(name: string): string {
  return subsystemLabels[name] ?? name.replace(/_/g, " ");
}

interface DiagnosticsPanelProps {
  onClose: () => void;
}

export function DiagnosticsPanel({ onClose }: DiagnosticsPanelProps) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [h, d] = await Promise.all([runHealthCheck(), collectDiagnostics()]);
      setHealth(h);
      setDiagnostics(d);
    } catch (err) {
      toast.error(`Diagnostics failed: ${err}`);
    } finally {
      setLoading(false);
    }
    setUpdateState(getUpdateState().state);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const path = await exportDiagnostics();
      if (path) toast.success("Diagnostics exported");
    } catch (err) {
      toast.error(`Export failed: ${err}`);
    } finally {
      setExporting(false);
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateState("checking");
    await checkForAppUpdate();
    setUpdateState(getUpdateState().state);
  };

  const updateLabel: Record<UpdateState, string> = {
    idle: "Check for updates",
    checking: "Checking…",
    "no-update": "Up to date",
    downloading: "Downloading…",
    ready: "Restart to apply",
    error: "Update failed — retry?",
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[12vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-[520px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Diagnostics</h2>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="text-xs text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded">
              Esc
            </kbd>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-surface-3 rounded transition-colors text-text-tertiary hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-text-tertiary">
              <Loader2 size={16} className="animate-spin mr-2" />
              Running health check…
            </div>
          ) : (
            <>
              {/* App Info */}
              {diagnostics && (
                <div>
                  <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                    App Info
                  </h3>
                  <div className="space-y-1 text-sm">
                    <InfoRow label="Version" value={diagnostics.app_version} />
                    <InfoRow label="OS" value={`${diagnostics.os} / ${diagnostics.arch}`} />
                    <InfoRow label="Tauri" value={diagnostics.tauri_version} />
                  </div>
                </div>
              )}

              {/* Health Check */}
              {health && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Health Check
                    </h3>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${health.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}
                    >
                      {health.ok ? "ALL PASS" : "ISSUES FOUND"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {health.subsystems.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-start gap-2 py-1.5 px-2 rounded bg-surface-1"
                      >
                        {s.ok ? (
                          <CheckCircle
                            size={14}
                            className="text-emerald-400 mt-0.5 flex-shrink-0"
                          />
                        ) : (
                          <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="text-sm text-text-primary">{formatSubsystemName(s.name)}</span>
                          <p className="text-xs text-text-tertiary break-all">{s.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Updates */}
              <div>
                <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                  Updates
                </h3>
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={updateState === "checking" || updateState === "downloading"}
                  className="w-full flex items-center gap-2 py-2 px-3 rounded bg-surface-1 text-sm text-text-secondary hover:bg-surface-3 transition-colors disabled:opacity-50"
                >
                  {updateState === "checking" || updateState === "downloading" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {updateLabel[updateState]}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} />
            Re-run
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 px-2 rounded hover:bg-surface-3/50 transition-colors">
      <span className="text-text-tertiary">{label}</span>
      <span className="text-text-primary font-mono text-xs">{value}</span>
    </div>
  );
}
