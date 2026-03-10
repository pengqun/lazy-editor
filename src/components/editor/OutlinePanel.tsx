import { List } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { type OutlineHeading, extractHeadings } from "../../lib/outline";
import { useEditorStore } from "../../stores/editor";

/** Debounce delay (ms) for heading extraction after edits. */
const OUTLINE_DEBOUNCE_MS = 300;

const INDENT: Record<number, string> = {
  1: "pl-0",
  2: "pl-4",
  3: "pl-8",
};

const TEXT_SIZE: Record<number, string> = {
  1: "text-xs font-semibold",
  2: "text-xs",
  3: "text-[11px] text-text-secondary",
};

export function OutlinePanel() {
  const editor = useEditorStore((s) => s.editor);
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return;

    // Immediate extraction on mount / editor change
    setHeadings(extractHeadings(editor.state.doc));

    const update = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!editor.isDestroyed) {
          setHeadings(extractHeadings(editor.state.doc));
        }
      }, OUTLINE_DEBOUNCE_MS);
    };

    editor.on("update", update);
    return () => {
      editor.off("update", update);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editor]);

  const handleJump = (pos: number) => {
    if (!editor) return;
    // Position cursor inside the heading (pos + 1) and scroll into view
    editor.chain().setTextSelection(pos + 1).scrollIntoView().run();
    editor.view.focus();
  };

  return (
    <div className="w-48 flex-shrink-0 border-r border-border bg-surface-1 flex flex-col overflow-hidden">
      <div className="h-8 flex items-center gap-1.5 px-3 border-b border-border">
        <List size={12} className="text-text-tertiary" />
        <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
          Outline
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {headings.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-text-tertiary">
            No headings found. Use H1–H3 to create structure.
          </p>
        ) : (
          headings.map((h) => (
            <button
              type="button"
              key={h.pos}
              onClick={() => handleJump(h.pos)}
              className={cn(
                "w-full text-left px-3 py-1 truncate text-text-primary hover:bg-surface-3/60 transition-colors",
                INDENT[h.level],
                TEXT_SIZE[h.level],
              )}
              title={h.text}
            >
              {h.text || "(empty heading)"}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
