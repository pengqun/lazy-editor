import { List } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/cn";
import {
  type OutlineHeading,
  adaptiveOutlineDebounce,
  extractHeadingsAsync,
} from "../../lib/outline";
import { isAbortError } from "../../lib/find-replace";
import { useEditorStore } from "../../stores/editor";

/** Height (px) of each heading row — used for virtual-scroll math. */
const ROW_HEIGHT = 28;
/** Extra rows rendered above/below the visible window to avoid flicker. */
const OVERSCAN = 5;
/** Heading count above which we switch to virtualised rendering. */
const VIRTUAL_THRESHOLD = 100;

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
  const [truncated, setTruncated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const debounceMs = useRef(300);

  // Virtualisation state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const runExtract = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      void extractHeadingsAsync(editor.state.doc, controller.signal)
        .then((result) => {
          if (controller.signal.aborted || requestIdRef.current !== requestId) return;
          if (result.cancelled) return;
          setHeadings(result.headings);
          setTruncated(result.truncated);
          debounceMs.current = adaptiveOutlineDebounce(result.headings.length);
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== requestId || isAbortError(error)) return;
          console.error("Outline extraction failed:", error);
        });
    };

    // Immediate extraction on mount / editor change
    runExtract();

    const update = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!editor.isDestroyed) {
          runExtract();
        }
      }, debounceMs.current);
    };

    editor.on("update", update);
    return () => {
      editor.off("update", update);
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [editor]);

  // Track scroll position for virtualisation
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollTop(scrollContainerRef.current.scrollTop);
    }
  }, []);

  // Observe container height for virtualisation window calc
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleJump = (pos: number) => {
    if (!editor) return;
    editor.chain().setTextSelection(pos + 1).scrollIntoView().run();
    editor.view.focus();
  };

  const useVirtual = headings.length > VIRTUAL_THRESHOLD;

  // Compute visible window
  const totalHeight = headings.length * ROW_HEIGHT;
  const startIdx = useVirtual
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const endIdx = useVirtual
    ? Math.min(
        headings.length,
        Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN,
      )
    : headings.length;
  const visibleHeadings = headings.slice(startIdx, endIdx);

  return (
    <div className="w-48 flex-shrink-0 border-r border-border bg-surface-1 flex flex-col overflow-hidden">
      <div className="h-8 flex items-center gap-1.5 px-3 border-b border-border">
        <List size={12} className="text-text-tertiary" />
        <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
          Outline
        </span>
        {headings.length > 0 && (
          <span className="ml-auto text-[10px] text-text-tertiary">
            {truncated ? `${headings.length}+` : headings.length}
          </span>
        )}
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-1.5"
      >
        {headings.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-text-tertiary">
            No headings found. Use H1-H3 to create structure.
          </p>
        ) : useVirtual ? (
          <div style={{ height: totalHeight, position: "relative" }}>
            {visibleHeadings.map((h, i) => {
              const idx = startIdx + i;
              return (
                <button
                  type="button"
                  key={h.pos}
                  onClick={() => handleJump(h.pos)}
                  className={cn(
                    "w-full text-left px-3 truncate text-text-primary hover:bg-surface-3/60 transition-colors absolute",
                    INDENT[h.level],
                    TEXT_SIZE[h.level],
                  )}
                  style={{
                    top: idx * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                    lineHeight: `${ROW_HEIGHT}px`,
                  }}
                  title={h.text}
                >
                  {h.text || "(empty heading)"}
                </button>
              );
            })}
          </div>
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
        {truncated && (
          <p className="px-3 py-1 text-[10px] text-text-tertiary italic">
            Showing first {headings.length} headings...
          </p>
        )}
      </div>
    </div>
  );
}
