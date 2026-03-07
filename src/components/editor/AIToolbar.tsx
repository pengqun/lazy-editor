import { Expand, FileText, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";

export function AIToolbar() {
  const selectedText = useEditorStore((s) => s.selectedText);
  const isStreaming = useAiStore((s) => s.isStreaming);
  const runAction = useAiStore((s) => s.runAction);
  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");

  if (!selectedText || isStreaming) return null;

  const handleRewrite = () => {
    if (!rewriteInstruction.trim()) return;
    runAction("rewrite", {
      selectedText,
      instruction: rewriteInstruction,
    });
    setShowRewriteInput(false);
    setRewriteInstruction("");
  };

  return (
    <div className="absolute top-2 right-4 z-10">
      <div className="bg-surface-2 border border-border rounded-lg shadow-xl p-1 flex items-center gap-1">
        <button
          onClick={() => runAction("expand", { selectedText })}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors",
          )}
          title="Expand with AI"
        >
          <Expand size={12} />
          Expand
        </button>

        <button
          onClick={() => setShowRewriteInput(!showRewriteInput)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors",
            showRewriteInput && "bg-accent/20 text-accent",
          )}
          title="Rewrite with AI"
        >
          <RefreshCw size={12} />
          Rewrite
        </button>

        <button
          onClick={() => runAction("summarize", { text: selectedText })}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors",
          )}
          title="Summarize with AI"
        >
          <FileText size={12} />
          Summarize
        </button>

        <div className="w-px h-4 bg-border" />

        <button
          onClick={() => runAction("research", { query: selectedText })}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-accent hover:text-accent transition-colors",
          )}
          title="Research this topic"
        >
          <Sparkles size={12} />
          Research
        </button>
      </div>

      {showRewriteInput && (
        <div className="mt-1 bg-surface-2 border border-border rounded-lg shadow-xl p-2">
          <input
            type="text"
            value={rewriteInstruction}
            onChange={(e) => setRewriteInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRewrite()}
            placeholder="How should I rewrite this?"
            className="w-64 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
