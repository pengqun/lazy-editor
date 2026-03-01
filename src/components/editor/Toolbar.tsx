import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { useEditorStore } from "../../stores/editor";
import { cn } from "../../lib/cn";

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded hover:bg-surface-3 transition-colors",
        isActive && "bg-accent/20 text-accent",
        disabled && "opacity-30 cursor-not-allowed",
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

  if (!editor) {
    return (
      <div className="h-10 border-b border-border bg-surface-1 flex items-center px-2" />
    );
  }

  const iconSize = 16;

  return (
    <div className="h-10 border-b border-border bg-surface-1 flex items-center px-2 gap-0.5">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold (Cmd+B)"
      >
        <Bold size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic (Cmd+I)"
      >
        <Italic size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title="Inline Code"
      >
        <Code size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Ordered List"
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="Blockquote"
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
        title="Undo (Cmd+Z)"
      >
        <Undo size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Cmd+Shift+Z)"
      >
        <Redo size={iconSize} />
      </ToolbarButton>

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI & KB toggles */}
      <ToolbarButton
        onClick={() => setShowCommandPalette(true)}
        title="AI Command Palette (Cmd+K)"
      >
        <Sparkles size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() =>
          setRightPanel(rightPanel === "knowledge" ? null : "knowledge")
        }
        isActive={rightPanel === "knowledge"}
        title="Knowledge Base"
      >
        <BookOpen size={iconSize} />
      </ToolbarButton>
    </div>
  );
}
