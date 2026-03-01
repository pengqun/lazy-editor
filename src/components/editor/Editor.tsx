import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Link from "@tiptap/extension-link";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useAIStream } from "../../hooks/useAI";

const lowlight = createLowlight(common);

export function Editor() {
  const setEditor = useEditorStore((s) => s.setEditor);
  const setSelectedText = useEditorStore((s) => s.setSelectedText);
  const activeFileContent = useFilesStore((s) => s.activeFileContent);
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const setDirty = useFilesStore((s) => s.setDirty);
  const setActiveFile = useFilesStore((s) => s.setActiveFile);

  useAutoSave();
  useAIStream();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing, or press Cmd+K to ask AI...",
      }),
      Typography,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-accent underline",
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    content: "",
    onUpdate: ({ editor }) => {
      if (activeFilePath) {
        const content = editor.getHTML();
        setActiveFile(activeFilePath, content);
        setDirty(true);
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        setSelectedText(editor.state.doc.textBetween(from, to, " "));
      } else {
        setSelectedText("");
      }
    },
    editorProps: {
      attributes: {
        class: "tiptap prose prose-invert max-w-none focus:outline-none",
      },
    },
  });

  useEffect(() => {
    setEditor(editor);
    return () => setEditor(null);
  }, [editor, setEditor]);

  // Load content when active file changes
  useEffect(() => {
    if (editor && activeFileContent !== undefined) {
      const currentContent = editor.getHTML();
      if (currentContent !== activeFileContent) {
        editor.commands.setContent(activeFileContent || "");
      }
    }
  }, [editor, activeFilePath]); // Only re-run when file path changes, not content

  if (!activeFilePath) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <p className="text-lg mb-2">No document open</p>
          <p className="text-sm">
            Select a file from the sidebar or press{" "}
            <kbd className="px-2 py-0.5 bg-surface-2 rounded text-xs">Cmd+K</kbd>{" "}
            to get started
          </p>
        </div>
      </div>
    );
  }

  return <EditorContent editor={editor} className="flex-1" />;
}
