import { useState } from "react";
import { Sparkles, FileText, Expand, RefreshCw, Search, X } from "lucide-react";
import { useAiStore, type AiAction } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";
import { cn } from "../../lib/cn";

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
  const runAction = useAiStore((s) => s.runAction);
  const selectedText = useEditorStore((s) => s.selectedText);

  const filteredCommands = input
    ? COMMANDS.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(input.toLowerCase()) ||
          cmd.description.toLowerCase().includes(input.toLowerCase()),
      )
    : COMMANDS;

  const handleSubmit = () => {
    if (!input.trim()) return;

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
              <button
                onClick={() => setSelectedCommand(null)}
                className="hover:text-white"
              >
                <X size={10} />
              </button>
            </span>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            placeholder={
              selectedCommand
                ? `Enter ${selectedCommand.label.toLowerCase()} instructions...`
                : "Ask AI to write, research, or edit..."
            }
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            autoFocus
          />
          <kbd className="text-xs text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded">
            Esc
          </kbd>
        </div>

        {/* Commands */}
        {!selectedCommand && (
          <div className="py-2 max-h-64 overflow-y-auto">
            {filteredCommands.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => handleCommandClick(cmd)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-left",
                  "hover:bg-surface-3 transition-colors",
                )}
              >
                <span className="text-text-tertiary">{cmd.icon}</span>
                <div>
                  <div className="text-sm text-text-primary">{cmd.label}</div>
                  <div className="text-xs text-text-tertiary">
                    {cmd.description}
                  </div>
                </div>
              </button>
            ))}

            {input && (
              <button
                onClick={handleSubmit}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-surface-3 transition-colors border-t border-border"
              >
                <Sparkles size={16} className="text-accent" />
                <div>
                  <div className="text-sm text-accent">
                    Ask AI: "{input}"
                  </div>
                  <div className="text-xs text-text-tertiary">
                    Free-form AI instruction with KB context
                  </div>
                </div>
              </button>
            )}
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
