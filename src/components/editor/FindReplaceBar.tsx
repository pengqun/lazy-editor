import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  ChevronRight,
  Loader2,
  Replace,
  ReplaceAll,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextSelection } from "@tiptap/pm/state";
import { cn } from "../../lib/cn";
import {
  adaptiveDebounce,
  estimateDocSize,
  searchPluginKey,
} from "../../lib/find-replace";
import { useEditorStore } from "../../stores/editor";

export function FindReplaceBar() {
  const editor = useEditorStore((s) => s.editor);
  const setShowFindReplace = useEditorStore((s) => s.setShowFindReplace);

  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Dispatch search state to the ProseMirror plugin
  const dispatchSearch = useCallback(
    (q: string, cs: boolean, idx?: number) => {
      if (!editor) return;
      const { view } = editor;
      const tr = view.state.tr.setMeta(searchPluginKey, {
        query: q,
        caseSensitive: cs,
        currentIndex: idx ?? 0,
      });
      view.dispatch(tr);

      // Read back computed state
      const pluginState = searchPluginKey.getState(view.state);
      if (pluginState) {
        setMatchCount(pluginState.matches.length);
        setCurrentIndex(pluginState.currentIndex);
        setTruncated(pluginState.truncated);
      }
      setSearching(false);
    },
    [editor],
  );

  // Debounced search when query or case-sensitivity changes.
  // Debounce delay adapts to document size to keep the UI responsive.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query) setSearching(true);

    const debounceMs = editor
      ? adaptiveDebounce(estimateDocSize(editor.state.doc))
      : 200;

    debounceRef.current = setTimeout(() => {
      dispatchSearch(query, caseSensitive);
    }, debounceMs);
  }, [query, caseSensitive, dispatchSearch, editor]);

  // Scroll editor to make the current match visible
  const scrollToCurrentMatch = useCallback(
    (index: number) => {
      if (!editor) return;
      const pluginState = searchPluginKey.getState(editor.view.state);
      if (!pluginState || pluginState.matches.length === 0) return;
      const match = pluginState.matches[index];
      if (!match) return;

      const { view } = editor;
      const tr = view.state.tr
        .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
        .scrollIntoView();
      view.dispatch(tr);
    },
    [editor],
  );

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      if (!editor || matchCount === 0) return;
      const nextIndex =
        ((currentIndex + direction) % matchCount + matchCount) % matchCount;
      dispatchSearch(query, caseSensitive, nextIndex);
      scrollToCurrentMatch(nextIndex);
    },
    [editor, matchCount, currentIndex, query, caseSensitive, dispatchSearch, scrollToCurrentMatch],
  );

  const handleReplaceCurrent = useCallback(() => {
    if (!editor || matchCount === 0) return;
    const pluginState = searchPluginKey.getState(editor.view.state);
    if (!pluginState) return;
    const match = pluginState.matches[currentIndex];
    if (!match) return;

    const { view } = editor;
    const tr = view.state.tr.insertText(replacement, match.from, match.to);
    view.dispatch(tr);

    // After replace, plugin will recompute; read new state
    const newState = searchPluginKey.getState(view.state);
    if (newState) {
      setMatchCount(newState.matches.length);
      setCurrentIndex(newState.currentIndex);
      setTruncated(newState.truncated);
      if (newState.matches.length > 0) {
        scrollToCurrentMatch(newState.currentIndex);
      }
    }
  }, [editor, matchCount, currentIndex, replacement, scrollToCurrentMatch]);

  const handleReplaceAll = useCallback(() => {
    if (!editor || matchCount === 0) return;
    const pluginState = searchPluginKey.getState(editor.view.state);
    if (!pluginState) return;

    // Replace from last to first to preserve positions
    const { view } = editor;
    const tr = view.state.tr;
    const reversed = [...pluginState.matches].reverse();
    for (const match of reversed) {
      tr.insertText(replacement, match.from, match.to);
    }
    view.dispatch(tr);

    const newState = searchPluginKey.getState(view.state);
    if (newState) {
      setMatchCount(newState.matches.length);
      setCurrentIndex(0);
      setTruncated(newState.truncated);
    }
  }, [editor, matchCount, replacement]);

  const handleClose = useCallback(() => {
    // Clear search decorations
    if (editor) {
      const { view } = editor;
      const tr = view.state.tr.setMeta(searchPluginKey, {
        query: "",
        caseSensitive: false,
        currentIndex: 0,
      });
      view.dispatch(tr);
    }
    setShowFindReplace(false);
  }, [editor, setShowFindReplace]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      goToMatch(e.shiftKey ? -1 : 1);
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleReplaceCurrent();
    }
  };

  return (
    <div className="border-b border-border bg-surface-1 px-3 py-1.5 flex flex-col gap-1">
      {/* Find row */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowReplace(!showReplace)}
          className="p-0.5 hover:bg-surface-3 rounded transition-colors text-text-tertiary"
          title="Toggle replace"
        >
          <ChevronRight
            size={14}
            className={cn("transition-transform", showReplace && "rotate-90")}
          />
        </button>

        <div className="flex-1 flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2 py-1 focus-within:border-accent">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find..."
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none min-w-0"
          />
          {query && (
            <span className="text-[10px] text-text-tertiary whitespace-nowrap flex items-center gap-1">
              {searching ? (
                <>
                  <Loader2 size={10} className="animate-spin" />
                  Searching...
                </>
              ) : matchCount > 0 ? (
                `${currentIndex + 1} of ${truncated ? `${matchCount}+` : matchCount}`
              ) : (
                "No results"
              )}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={cn(
            "p-1 rounded transition-colors",
            caseSensitive
              ? "bg-accent/20 text-accent"
              : "text-text-tertiary hover:bg-surface-3",
          )}
          title="Match case"
        >
          <CaseSensitive size={14} />
        </button>

        <button
          type="button"
          onClick={() => goToMatch(-1)}
          disabled={matchCount === 0}
          className="p-1 rounded transition-colors text-text-tertiary hover:bg-surface-3 disabled:opacity-30"
          title="Previous match"
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => goToMatch(1)}
          disabled={matchCount === 0}
          className="p-1 rounded transition-colors text-text-tertiary hover:bg-surface-3 disabled:opacity-30"
          title="Next match"
        >
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="p-1 rounded transition-colors text-text-tertiary hover:bg-surface-3"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1.5 pl-[22px]">
          <div className="flex-1 flex items-center bg-surface-2 border border-border rounded px-2 py-1 focus-within:border-accent">
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace..."
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none min-w-0"
            />
          </div>
          <button
            type="button"
            onClick={handleReplaceCurrent}
            disabled={matchCount === 0}
            className="p-1 rounded transition-colors text-text-tertiary hover:bg-surface-3 disabled:opacity-30"
            title="Replace"
          >
            <Replace size={14} />
          </button>
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={matchCount === 0}
            className="p-1 rounded transition-colors text-text-tertiary hover:bg-surface-3 disabled:opacity-30"
            title="Replace all"
          >
            <ReplaceAll size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
