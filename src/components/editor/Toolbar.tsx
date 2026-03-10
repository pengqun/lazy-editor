import {
  ArrowDownToLine,
  Bold,
  BookOpen,
  ChevronDown,
  Clock,
  Code,
  Download,
  Expand,
  FileCode,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  HelpCircle,
  Italic,
  List,
  ListOrdered,
  ListTree,
  Loader2,
  Minus,
  MousePointerClick,
  Printer,
  Quote,
  Redo,
  RefreshCw,
  Replace,
  Search,
  Sparkles,
  Strikethrough,
  Undo,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { exportEditorToHtml } from "../../lib/export-html";
import { exportEditorToMarkdown } from "../../lib/export-markdown";
import { exportEditorToPdf } from "../../lib/export-pdf";
import type { OutputPlacementMode } from "../../lib/output-placement";
import { altKey, modKey, shiftKey } from "../../lib/shortcuts";
import { useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";
import { toast } from "../../stores/toast";

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
      type="button"
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

const PLACEMENT_OPTIONS: {
  value: OutputPlacementMode | null;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: null, label: "Auto", icon: <MousePointerClick size={14} /> },
  { value: "replace_selection", label: "Replace selection", icon: <Replace size={14} /> },
  { value: "insert_at_cursor", label: "Insert at cursor", icon: <MousePointerClick size={14} /> },
  { value: "append_to_end", label: "Append to end", icon: <ArrowDownToLine size={14} /> },
];

function PlacementPicker({
  value,
  onChange,
  open,
  onToggle,
  onClose,
  disabled,
}: {
  value: OutputPlacementMode | null;
  onChange: (mode: OutputPlacementMode | null) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const current = PLACEMENT_OPTIONS.find((o) => o.value === value) ?? PLACEMENT_OPTIONS[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title="AI output placement"
        className={cn(
          "flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-3",
          value != null && "text-accent",
        )}
      >
        {current.icon}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-20 bg-surface-2 border border-border rounded-lg shadow-xl py-1 min-w-[160px]">
          {PLACEMENT_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.label}
              onClick={() => {
                onChange(opt.value);
                onClose();
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                opt.value === value
                  ? "bg-accent/15 text-accent"
                  : "hover:bg-surface-3 text-text-secondary",
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportMenu({
  editor,
  iconSize,
}: {
  editor: NonNullable<ReturnType<typeof useEditorStore.getState>["editor"]>;
  iconSize: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const handleMarkdown = async () => {
    setOpen(false);
    const path = await exportEditorToMarkdown(editor);
    if (path) toast.success("Exported as Markdown");
  };

  const handleHtml = async () => {
    setOpen(false);
    try {
      const path = await exportEditorToHtml(editor);
      if (path) toast.success("Exported as HTML");
    } catch {
      toast.error("HTML export failed");
    }
  };

  const handlePdf = () => {
    setOpen(false);
    try {
      exportEditorToPdf(editor);
      toast.info("Print dialog opened — choose Save as PDF");
    } catch {
      toast.error("PDF export failed");
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <ToolbarButton onClick={() => setOpen((v) => !v)} title={`Export (${modKey}${shiftKey}E)`}>
        <Download size={iconSize} />
      </ToolbarButton>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-20 bg-surface-2 border border-border rounded-lg shadow-xl py-1 min-w-[180px]">
          <button
            type="button"
            onClick={handleMarkdown}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-3 text-text-secondary transition-colors"
          >
            <FileText size={14} />
            Markdown
            <span className="ml-auto text-text-tertiary">
              {modKey}
              {shiftKey}E
            </span>
          </button>
          <button
            type="button"
            onClick={handleHtml}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-3 text-text-secondary transition-colors"
          >
            <FileCode size={14} />
            HTML
            <span className="ml-auto text-text-tertiary">
              {modKey}
              {shiftKey}H
            </span>
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-3 text-text-secondary transition-colors"
          >
            <Printer size={14} />
            PDF (Print)
            <span className="ml-auto text-text-tertiary">
              {modKey}
              {shiftKey}P
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const editor = useEditorStore((s) => s.editor);
  const rightPanel = useEditorStore((s) => s.rightPanel);
  const setRightPanel = useEditorStore((s) => s.setRightPanel);
  const setShowCommandPalette = useEditorStore((s) => s.setShowCommandPalette);
  const setShowShortcutHelp = useEditorStore((s) => s.setShowShortcutHelp);
  const showFindReplace = useEditorStore((s) => s.showFindReplace);
  const setShowFindReplace = useEditorStore((s) => s.setShowFindReplace);
  const showOutline = useEditorStore((s) => s.showOutline);
  const setShowOutline = useEditorStore((s) => s.setShowOutline);
  const showVersionHistory = useEditorStore((s) => s.showVersionHistory);
  const setShowVersionHistory = useEditorStore((s) => s.setShowVersionHistory);
  const selectedText = useEditorStore((s) => s.selectedText);

  const isStreaming = useAiStore((s) => s.isStreaming);
  const currentAction = useAiStore((s) => s.currentAction);
  const runAction = useAiStore((s) => s.runAction);
  const outputPlacementOverride = useAiStore((s) => s.outputPlacementOverride);
  const setOutputPlacementOverride = useAiStore((s) => s.setOutputPlacementOverride);

  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const rewriteInputRef = useRef<HTMLInputElement>(null);
  const [showPlacementPicker, setShowPlacementPicker] = useState(false);
  const placementPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showRewriteInput) {
      rewriteInputRef.current?.focus();
    }
  }, [showRewriteInput]);

  useEffect(() => {
    if (!showPlacementPicker) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (placementPickerRef.current && !placementPickerRef.current.contains(target)) {
        setShowPlacementPicker(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showPlacementPicker]);

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
    runAction("rewrite", { selectedText, instruction: rewriteInstruction }, hasSelection);
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
          onClick={() => runAction("expand", { selectedText: selectedText! }, hasSelection)}
          disabled={aiDisabled}
          title={hasSelection ? "Expand with AI" : "Select text to expand"}
        >
          {isActionActive("expand") ? (
            <Loader2 size={iconSize} className="animate-spin" />
          ) : (
            <Expand size={iconSize} />
          )}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => !isStreaming && setShowRewriteInput(!showRewriteInput)}
          disabled={aiDisabled}
          isActive={showRewriteInput}
          title={hasSelection ? "Rewrite with AI" : "Select text to rewrite"}
        >
          {isActionActive("rewrite") ? (
            <Loader2 size={iconSize} className="animate-spin" />
          ) : (
            <RefreshCw size={iconSize} />
          )}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAction("summarize", { text: selectedText! }, hasSelection)}
          disabled={aiDisabled}
          title={hasSelection ? "Summarize with AI" : "Select text to summarize"}
        >
          {isActionActive("summarize") ? (
            <Loader2 size={iconSize} className="animate-spin" />
          ) : (
            <FileText size={iconSize} />
          )}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAction("research", { query: selectedText! }, hasSelection)}
          disabled={aiDisabled}
          title={hasSelection ? "Research with AI" : "Select text to research"}
        >
          {isActionActive("research") ? (
            <Loader2 size={iconSize} className="animate-spin" />
          ) : (
            <Search size={iconSize} />
          )}
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
              ref={rewriteInputRef}
              className="w-64 bg-surface-3 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
        )}
      </div>

      {/* AI output placement mode picker */}
      <div ref={placementPickerRef}>
        <PlacementPicker
          value={outputPlacementOverride}
          onChange={setOutputPlacementOverride}
          open={showPlacementPicker}
          onToggle={() => setShowPlacementPicker((v) => !v)}
          onClose={() => setShowPlacementPicker(false)}
          disabled={isStreaming}
        />
      </div>

      <Separator />

      {/* Export dropdown */}
      <ExportMenu editor={editor} iconSize={iconSize} />

      {/* Version History */}
      <ToolbarButton
        onClick={() => setShowVersionHistory(!showVersionHistory)}
        isActive={showVersionHistory}
        title={`Version History (${modKey}${shiftKey}V)`}
      >
        <Clock size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* Find/Replace & Outline */}
      <ToolbarButton
        onClick={() => setShowFindReplace(!showFindReplace)}
        isActive={showFindReplace}
        title={`Find & Replace (${modKey}F)`}
      >
        <Search size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setShowOutline(!showOutline)}
        isActive={showOutline}
        title={`Document Outline (${modKey}${shiftKey}O)`}
      >
        <ListTree size={iconSize} />
      </ToolbarButton>

      <Separator />

      {/* AI & KB toggles */}
      <ToolbarButton
        onClick={() => setShowCommandPalette(true)}
        title={`AI Command Palette (${modKey}K)`}
      >
        <Sparkles size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setRightPanel(rightPanel === "knowledge" ? null : "knowledge")}
        isActive={rightPanel === "knowledge"}
        title="Knowledge Base"
      >
        <BookOpen size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setShowShortcutHelp(true)}
        title={`Keyboard Shortcuts (${modKey}/)`}
      >
        <HelpCircle size={iconSize} />
      </ToolbarButton>
    </div>
  );
}
