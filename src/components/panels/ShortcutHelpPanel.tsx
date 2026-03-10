import { X } from "lucide-react";
import { altKey, modKey, shiftKey } from "../../lib/shortcuts";

interface ShortcutHelpPanelProps {
  onClose: () => void;
}

interface Shortcut {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "File Actions",
    shortcuts: [
      { keys: `${modKey}S`, label: "Save file" },
      { keys: `${modKey}N`, label: "New file" },
      { keys: `${modKey}O`, label: "Open workspace folder" },
      { keys: `${modKey}${shiftKey}E`, label: "Export as Markdown" },
      { keys: `${modKey}${shiftKey}H`, label: "Export as HTML" },
      { keys: `${modKey}${shiftKey}P`, label: "Export as PDF (Print)" },
    ],
  },
  {
    title: "Editor Formatting",
    shortcuts: [
      { keys: `${modKey}B`, label: "Bold" },
      { keys: `${modKey}I`, label: "Italic" },
      { keys: `${modKey}${shiftKey}X`, label: "Strikethrough" },
      { keys: `${modKey}E`, label: "Inline code" },
      { keys: `${modKey}${altKey}1`, label: "Heading 1" },
      { keys: `${modKey}${altKey}2`, label: "Heading 2" },
      { keys: `${modKey}${altKey}3`, label: "Heading 3" },
      { keys: `${modKey}${shiftKey}8`, label: "Bullet list" },
      { keys: `${modKey}${shiftKey}7`, label: "Ordered list" },
      { keys: `${modKey}${shiftKey}B`, label: "Blockquote" },
      { keys: `${modKey}Z`, label: "Undo" },
      { keys: `${modKey}${shiftKey}Z`, label: "Redo" },
    ],
  },
  {
    title: "AI Actions",
    shortcuts: [
      { keys: `${modKey}K`, label: "Open command palette" },
      { keys: `${modKey}1–5`, label: "Quick-select AI command" },
    ],
  },
  {
    title: "Find & Navigation",
    shortcuts: [
      { keys: `${modKey}F`, label: "Find & Replace" },
      { keys: `${modKey}${shiftKey}O`, label: "Document outline" },
      { keys: "Enter", label: "Next match (in Find bar)" },
      { keys: `${shiftKey}Enter`, label: "Previous match (in Find bar)" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: `${modKey},`, label: "Open settings" },
      { keys: `${modKey}/`, label: "Shortcut help" },
      { keys: "Esc", label: "Close panel / modal" },
    ],
  },
];

export function ShortcutHelpPanel({ onClose }: ShortcutHelpPanelProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
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
          <h2 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <div className="flex items-center gap-2">
            <kbd className="text-xs text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded">Esc</kbd>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-surface-3 rounded transition-colors text-text-tertiary hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Shortcut groups */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-surface-3/50 transition-colors"
                  >
                    <span className="text-sm text-text-secondary">{shortcut.label}</span>
                    <kbd className="text-xs text-text-tertiary bg-surface-3 px-2 py-0.5 rounded font-mono">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
