import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import { type ToastType, useToastStore } from "../stores/toast";

const ICON: Record<ToastType, typeof Info> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const COLOR: Record<ToastType, string> = {
  success: "text-green-400",
  error: "text-red-400",
  info: "text-accent",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICON[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2 shadow-xl animate-toast-in min-w-[240px] max-w-[360px]"
          >
            <Icon size={16} className={`flex-shrink-0 ${COLOR[t.type]}`} />
            <span className="text-sm text-text-primary flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="p-0.5 hover:bg-surface-3 rounded transition-colors flex-shrink-0"
            >
              <X size={12} className="text-text-tertiary" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
