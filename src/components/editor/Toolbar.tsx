import {
  Bold,
  BookOpen,
  Code,
  Download,
  Expand,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo,
  RefreshCw,
  Search,
  Sparkles,
  Strikethrough,
  Undo,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { exportEditorToMarkdown } from "../../lib/export-markdown";
import { altKey, modKey, shiftKey } from "../../lib/shortcuts";
import { useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-3",
        isActive && "bg-accent/20 text-accent",
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="w-px h-5 bg-border mx-1" />;
}

export function Toolbar() {
  const editor = useEditorStore((s) => s.editor);
  const rightPanel = useEditorStore((s) => s.rightPanel);
  const setRightPanel = useEditorStore((s) => s.setRightPanel);
  const setShowCommandPalette = useEditorStore((s) => s.setShowCommandPalette);
  const selectedText = useEditorStore((s) => s.selectedText);

  const isStreaming = useAiStore((s) => s.isStreaming);
  const currentAction = useAiStore((s) => s.currentAction);
  const runAction = useAiStore((s) => s.runAction);

  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");

  if (!editor) {
    return <div className="h-10 border-b border-border bg-surface-1 flex items-center px-2" />;
  }

  const iconSize = 16;
  const hasSelection = !!selectedText;
  const aiDisabled = !hasSelection || isStreaming;

  const isActionActive = (action: "expand" | "rewrite" | "summarize" | "research") =>
    isStreaming && currentAction === action;

  const handleRewrite = () => {
    if (!rewriteInstruction.trim() || isStreaming || !selectedText) return;
    runAction("rewrite", { selectedText, instruction: rewriteInstruction });
    setShowRewriteInput(false);
    setRewriteInstruction("");
  };

  return (
    <div className="h-10 border-b border-border bg-surface-1 flex items-center px-2 gap-0.5">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title={`Bold (${modKey}B)`}
      >
        <Bold size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title={`Italic (${modKey}I)`}
      >
        <Italic size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title={`Strikethrough (${modKey}${shiftKey}X)`}
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title={`Inline Code (${modKey}E)`}
      >
        <Code size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title={`Heading 1 (${modKey}${altKey}1)`}
      >
        <Heading1 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title={`Heading 2 (${modKey}${altKey}2)`}
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title={`Heading 3 (${modKey}${altKey}3)`}
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title={`Bullet List (${modKey}${shiftKey}8)`}
      >
        <List size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title={`Ordered List (${modKey}${shiftKey}7)`}
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title={`Blockquote (${modKey}${shiftKey}B)`}
      >
        <Quote size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={`Undo (${modKey}Z)`}
      >
        <Undo size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={`Redo (${modKey}${shiftKey}Z)`}
      >
        <Redo size={iconSize} />
      </ToolbarButton>

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI Quick Actions */}
      <Separator />
      <div className="relative flex items-center">
        <ToolbarButton
          onClick={() => runAction("expand", { selectedText: selectedText! })}
          disabled={aiDisabled}
          title={hasSelection ? "Expand with AI" : "Select text to expand"}
        >
          {isActionActive("expand") ? <Loader2 size={iconSize} className="animate-spin" /> : <Expand size={iconSize} />}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => !isStreaming && setShowRewriteInput(!showRewriteInput)}
          disabled={aiDisabled}
          isActive={showRewriteInput}
          title={hasSelection ? "Rewrite with AI" : "Select text to rewrite"}
        >
          {isActionActive("rewrite") ? <Loader2 size={iconSize} className="animate-spin" /> : <RefreshCw size={iconSize} />}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAction("summarize", { text: selectedText! })}
          disabled={aiDisabled}
          title={hasSelection ? "Summarize with AI" : "Select text to summarize"}
        >
          {isActionActive("summarize") ? <Loader2 size={iconSize} className="animate-spin" /> : <FileText size={iconSize} />}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAction("research", { query: selectedText! })}
          disabled={aiDisabled}
          title={hasSelection ? "Research with AI" : "Select text to research"}
        >
          {isActionActive("research") ? <Loader2 size={iconSize} className="animate-spin" /> : <Search size={iconSize} />}
        </ToolbarButton>

        {showRewriteInput && !isStreaming && hasSelection && (
          <div className="absolute top-full right-0 mt-1 z-20 bg-surface-2 border border-border rounded-lg shadow-xl p-2">
            <input
              type="text"
              value={rewriteInstruction}
              onChange={(e) => setRewriteInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRewrite();
                if (e.key === "Escape") setShowRewriteInput(false);
              }}
              onBlur={() => setShowRewriteInput(false)}
              placeholder="How should I rewrite this?"
              className="w-64 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>
        )}
      </div>

      <Separator />

      {/* Export */}
      <ToolbarButton
        onClick={() => exportEditorToMarkdown(editor)}
        title={`Export Markdown (${modKey}${shiftKey}E)`}
      >
        <Download size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* AI & KB toggles */}
      <ToolbarButton onClick={() => setShowCommandPalette(true)} title={`AI Command Palette (${modKey}K)`}>
        <Sparkles size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setRightPanel(rightPanel === "knowledge" ? null : "knowledge")}
        isActive={rightPanel === "knowledge"}
        title="Knowledge Base"
      >
        <BookOpen size={iconSize} />
      </ToolbarButton>
    </div>
  );
}
