import { Expand, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";

export function AIToolbar() {
  const selectedText = useEditorStore((s) => s.selectedText);
  const isStreaming = useAiStore((s) => s.isStreaming);
  const currentAction = useAiStore((s) => s.currentAction);
  const runAction = useAiStore((s) => s.runAction);
  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");

  if (!selectedText) return null;

  const handleRewrite = () => {
    if (!rewriteInstruction.trim() || isStreaming) return;
    runAction("rewrite", {
      selectedText,
      instruction: rewriteInstruction,
    });
    setShowRewriteInput(false);
    setRewriteInstruction("");
  };

  const isActionActive = (action: "expand" | "rewrite" | "summarize" | "research") =>
    isStreaming && currentAction === action;

  return (
    <div className="absolute top-2 right-4 z-10">
      <div className="bg-surface-2 border border-border rounded-lg shadow-xl p-1 flex items-center gap-1">
        <button
          onClick={() => runAction("expand", { selectedText })}
          disabled={isStreaming}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            isActionActive("expand") && "bg-accent/20 text-accent",
          )}
          title="Expand with AI"
        >
          {isActionActive("expand") ? <Loader2 size={12} className="animate-spin" /> : <Expand size={12} />}
          {isActionActive("expand") ? "Expanding..." : "Expand"}
        </button>

        <button
          onClick={() => !isStreaming && setShowRewriteInput(!showRewriteInput)}
          disabled={isStreaming}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            showRewriteInput && "bg-accent/20 text-accent",
            isActionActive("rewrite") && "bg-accent/20 text-accent",
          )}
          title="Rewrite with AI"
        >
          {isActionActive("rewrite") ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          {isActionActive("rewrite") ? "Rewriting..." : "Rewrite"}
        </button>

        <button
          onClick={() => runAction("summarize", { text: selectedText })}
          disabled={isStreaming}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            isActionActive("summarize") && "bg-accent/20 text-accent",
          )}
          title="Summarize with AI"
        >
          {isActionActive("summarize") ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <FileText size={12} />
          )}
          {isActionActive("summarize") ? "Summarizing..." : "Summarize"}
        </button>

        <div className="w-px h-4 bg-border" />

        <button
          onClick={() => runAction("research", { query: selectedText })}
          disabled={isStreaming}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            "hover:bg-surface-3 text-accent hover:text-accent transition-colors",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            isActionActive("research") && "bg-accent/20",
          )}
          title="Research this topic"
        >
          {isActionActive("research") ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {isActionActive("research") ? "Researching..." : "Research"}
        </button>
      </div>

      {showRewriteInput && !isStreaming && (
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
