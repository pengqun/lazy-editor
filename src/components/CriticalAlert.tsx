import { AlertTriangle } from "lucide-react";
import { useAlertStore } from "../stores/alert";

export function CriticalAlert() {
  const alert = useAlertStore((s) => s.alert);
  const dismiss = useAlertStore((s) => s.dismissAlert);

  if (!alert) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="w-[420px] bg-surface-2 border border-red-400/30 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex gap-3 items-start">
          <div className="mt-0.5 p-1.5 rounded-lg bg-red-400/10">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">{alert.title}</h3>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">{alert.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          {alert.actions.map((action) => (
            <button
              type="button"
              key={action.label}
              onClick={() => {
                action.onClick();
                dismiss();
              }}
              className={
                action.variant === "primary"
                  ? "text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 transition-colors"
                  : "text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-3 transition-colors"
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
