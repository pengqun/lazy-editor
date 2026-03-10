import { AlertTriangle } from "lucide-react";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";
import { useRecoveryStore } from "../../stores/recovery";
import { toast } from "../../stores/toast";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function RecoveryDialog() {
  const pendingDraft = useRecoveryStore((s) => s.pendingDraft);
  const showRecoveryDialog = useRecoveryStore((s) => s.showRecoveryDialog);
  const acceptRecovery = useRecoveryStore((s) => s.acceptRecovery);
  const discardRecovery = useRecoveryStore((s) => s.discardRecovery);
  const editor = useEditorStore((s) => s.editor);

  if (!showRecoveryDialog || !pendingDraft) return null;

  const preview = pendingDraft.content.replace(/<[^>]*>/g, "").slice(0, 200);
  const fileName =
    pendingDraft.filePath === "__untitled__"
      ? "Untitled document"
      : pendingDraft.filePath.split("/").pop() ?? pendingDraft.filePath;

  const handleRestore = () => {
    const content = acceptRecovery();
    if (content !== null && editor) {
      editor.commands.setContent(content);
      useFilesStore.setState({
        activeFileContent: content,
        isDirty: true,
      });
      toast.success("Recovered unsaved draft");
    }
  };

  const handleDiscard = () => {
    discardRecovery();
    toast.info("Draft discarded");
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[440px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-2">
          <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-text-primary">Unsaved Draft Found</h2>
        </div>

        {/* Body */}
        <div className="px-5 pb-4">
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            A more recent unsaved version of <strong>{fileName}</strong> was found from{" "}
            <strong>{formatTimestamp(pendingDraft.timestamp)}</strong>. This may be from a previous
            session that ended unexpectedly.
          </p>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="bg-surface-1 border border-border rounded-lg px-3 py-2 mb-4">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                Draft preview
              </p>
              <p className="text-xs text-text-secondary line-clamp-3">{preview}…</p>
            </div>
          )}

          <p className="text-xs text-text-tertiary mb-4">
            Choose <strong>Restore</strong> to load the recovered draft (you can still undo), or{" "}
            <strong>Discard</strong> to keep the saved version on disk.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={handleDiscard}
            className="text-xs px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-surface-3 transition-colors"
          >
            Discard Draft
          </button>
          <button
            type="button"
            onClick={handleRestore}
            className="text-xs px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Restore Draft
          </button>
        </div>
      </div>
    </div>
  );
}
