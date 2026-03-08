import { Expand, FileText, Loader2, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { modKey } from "../../lib/shortcuts";
import { type AiAction, useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";

interface CommandPaletteProps {
  onClose: () => void;
}

interface Command {
  id: AiAction | "freeform";
  label: string;
  description: string;
  icon: React.ReactNode;
}

const COMMANDS: Command[] = [
  {
    id: "draft",
    label: "Draft",
    description: "Write a new section or blog post on a topic",
    icon: <FileText size={16} />,
  },
  {
    id: "expand",
    label: "Expand",
    description: "Expand the selected text with more detail",
    icon: <Expand size={16} />,
  },
  {
    id: "rewrite",
    label: "Rewrite",
    description: "Rewrite the selected text with specific instructions",
    icon: <RefreshCw size={16} />,
  },
  {
    id: "research",
    label: "Research",
    description: "Research a topic using the knowledge base",
    icon: <Search size={16} />,
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Summarize the selected text concisely",
    icon: <FileText size={16} />,
  },
];

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [input, setInput] = useState("");
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const runAction = useAiStore((s) => s.runAction);
  const isStreaming = useAiStore((s) => s.isStreaming);
  const selectedText = useEditorStore((s) => s.selectedText);

  const showCommandList = !selectedCommand;

  const filteredCommands = input
    ? COMMANDS.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(input.toLowerCase()) ||
          cmd.description.toLowerCase().includes(input.toLowerCase()),
      )
    : COMMANDS;

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filteredCommands.length]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;

    if (selectedCommand) {
      const params: Record<string, string> = {};
      switch (selectedCommand.id) {
        case "draft":
          params.topic = input;
          params.style = "blog post";
          params.kbContextCount = "5";
          break;
        case "expand":
          params.selectedText = selectedText || input;
          break;
        case "rewrite":
          params.selectedText = selectedText || "";
          params.instruction = input;
          break;
        case "research":
          params.query = input;
          break;
        case "summarize":
          params.text = selectedText || input;
          break;
      }
      runAction(selectedCommand.id as AiAction, params);
    } else {
      // Free-form: treat as a draft action
      runAction("draft", { topic: input, style: "natural", kbContextCount: "5" });
    }
    onClose();
  };

  const handleCommandClick = (cmd: Command) => {
    setSelectedCommand(cmd);
    setInput("");
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Arrow navigation and Enter selection only when command list is visible
      if (showCommandList) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
          return;
        }

        // Enter: select active command if input is empty, otherwise submit
        if (e.key === "Enter") {
          if (!input.trim() && filteredCommands[activeIndex]) {
            e.preventDefault();
            handleCommandClick(filteredCommands[activeIndex]);
            return;
          }
          handleSubmit();
          return;
        }

        // Ctrl/Cmd + 1..5 quick-select
        const digit = Number.parseInt(e.key, 10);
        if (digit >= 1 && digit <= 5 && (e.ctrlKey || e.metaKey)) {
          const idx = digit - 1;
          if (idx < filteredCommands.length) {
            e.preventDefault();
            handleCommandClick(filteredCommands[idx]);
          }
          return;
        }
      } else {
        // When a command is selected, Enter submits
        if (e.key === "Enter") {
          handleSubmit();
          return;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showCommandList, filteredCommands, activeIndex, input, selectedCommand],
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[20vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[560px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Sparkles size={18} className="text-accent flex-shrink-0" />
          {selectedCommand && (
            <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded flex items-center gap-1">
              {selectedCommand.label}
              <button onClick={() => setSelectedCommand(null)} className="hover:text-white">
                <X size={10} />
              </button>
            </span>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedCommand
                ? `Enter ${selectedCommand.label.toLowerCase()} instructions...`
                : "Ask AI to write, research, or edit..."
            }
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            autoFocus
          />
          <kbd className="text-xs text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>

        {/* Commands */}
        {showCommandList && (
          <div className="py-2 max-h-64 overflow-y-auto">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => handleCommandClick(cmd)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                  idx === activeIndex
                    ? "bg-accent/15 border-l-2 border-l-accent"
                    : "hover:bg-surface-3 border-l-2 border-l-transparent",
                )}
              >
                <span className={cn(idx === activeIndex ? "text-accent" : "text-text-tertiary")}>
                  {cmd.icon}
                </span>
                <div className="flex-1">
                  <div className="text-sm text-text-primary">{cmd.label}</div>
                  <div className="text-xs text-text-tertiary">{cmd.description}</div>
                </div>
                <kbd className="text-[10px] text-text-tertiary bg-surface-3 px-1 py-0.5 rounded opacity-60">
                  {modKey}{idx + 1}
                </kbd>
              </button>
            ))}

            {input && (
              <button
                onClick={handleSubmit}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-surface-3 transition-colors border-t border-border"
              >
                <Sparkles size={16} className="text-accent" />
                <div>
                  <div className="text-sm text-accent">Ask AI: "{input}"</div>
                  <div className="text-xs text-text-tertiary">
                    Free-form AI instruction with KB context
                  </div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* AI busy indicator */}
        {isStreaming && (
          <div className="px-4 py-2 border-t border-border bg-accent/5">
            <div className="flex items-center gap-2 text-xs text-accent">
              <Loader2 size={12} className="animate-spin" />
              AI is currently active — wait for it to finish
            </div>
          </div>
        )}

        {/* Context hint */}
        {selectedText && (
          <div className="px-4 py-2 border-t border-border bg-surface-1">
            <span className="text-xs text-text-tertiary">
              Selected text: "{selectedText.slice(0, 80)}
              {selectedText.length > 80 ? "..." : ""}"
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
