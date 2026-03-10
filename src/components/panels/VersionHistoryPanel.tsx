import { Camera, Clock, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { criticalAlert } from "../../stores/alert";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";
import { useSnapshotsStore } from "../../stores/snapshots";
import { toast } from "../../stores/toast";

interface VersionHistoryPanelProps {
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}Z`); // SQLite datetime is UTC
  return d.toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export function VersionHistoryPanel({ onClose }: VersionHistoryPanelProps) {
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const activeFileContent = useFilesStore((s) => s.activeFileContent);
  const editor = useEditorStore((s) => s.editor);
  const snapshots = useSnapshotsStore((s) => s.snapshots);
  const isLoading = useSnapshotsStore((s) => s.isLoading);
  const loadSnapshots = useSnapshotsStore((s) => s.loadSnapshots);
  const createSnapshot = useSnapshotsStore((s) => s.createSnapshot);
  const restoreSnapshot = useSnapshotsStore((s) => s.restoreSnapshot);
  const deleteSnapshot = useSnapshotsStore((s) => s.deleteSnapshot);

  useEffect(() => {
    if (activeFilePath) {
      loadSnapshots(activeFilePath);
    }
  }, [activeFilePath, loadSnapshots]);

  const handleManualSnapshot = async () => {
    if (!activeFilePath) return;
    await createSnapshot(activeFilePath, activeFileContent);
  };

  const handleRestore = (snapshotId: number, createdAt: string) => {
    criticalAlert.show({
      title: "Restore Snapshot",
      message: `Replace current content with snapshot from ${formatDate(createdAt)}? Current unsaved changes will be lost.`,
      actions: [
        { label: "Cancel", variant: "secondary", onClick: () => {} },
        {
          label: "Restore",
          variant: "primary",
          onClick: async () => {
            const content = await restoreSnapshot(snapshotId);
            if (content !== null && editor) {
              editor.commands.setContent(content);
              useFilesStore.setState({
                activeFileContent: content,
                isDirty: true,
              });
              toast.success("Snapshot restored");
            }
          },
        },
      ],
    });
  };

  const handleDelete = (snapshotId: number, filePath: string) => {
    deleteSnapshot(snapshotId, filePath);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[480px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">Version History</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-surface-3 rounded transition-colors"
          >
            <X size={16} className="text-text-tertiary" />
          </button>
        </div>

        {/* Manual snapshot button */}
        <div className="px-4 py-3 border-b border-border">
          <button
            type="button"
            onClick={handleManualSnapshot}
            disabled={!activeFilePath}
            className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            <Camera size={14} />
            Save Snapshot Now
          </button>
        </div>

        {/* Snapshot list */}
        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-text-tertiary text-xs">Loading...</div>
          ) : snapshots.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary text-xs">
              No snapshots yet. Snapshots are created automatically when you save, or click above.
            </div>
          ) : (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                className="px-4 py-3 border-b border-border hover:bg-surface-1/50 transition-colors group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">
                    {formatDate(snap.createdAt)}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleRestore(snap.id, snap.createdAt)}
                      className="p-1 hover:bg-surface-3 rounded text-text-tertiary hover:text-accent transition-colors"
                      title="Restore this snapshot"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(snap.id, snap.filePath)}
                      className="p-1 hover:bg-surface-3 rounded text-text-tertiary hover:text-red-400 transition-colors"
                      title="Delete this snapshot"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-tertiary truncate">{snap.preview}</p>
                <span className="text-[10px] text-text-tertiary/60">
                  {formatSize(snap.contentLength)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
