import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { useAIStream } from "../../hooks/useAI";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useRecoveryDraft } from "../../hooks/useRecoveryDraft";
import { SearchAndReplace } from "../../lib/find-replace";
import { loadLanguagesForDoc, lowlight } from "../../lib/lowlight-loader";
import { modKey } from "../../lib/shortcuts";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";

/** Debounce delay (ms) for expensive per-keystroke work (word count, language loading). */
const UPDATE_DEBOUNCE_MS = 300;

export function Editor() {
  const setEditor = useEditorStore((s) => s.setEditor);
  const setSelectedText = useEditorStore((s) => s.setSelectedText);
  const setWordCount = useEditorStore((s) => s.setWordCount);
  const activeFileContent = useFilesStore((s) => s.activeFileContent);
  const activeFilePath = useFilesStore((s) => s.activeFilePath);

  const contentRef = useRef(activeFileContent);
  contentRef.current = activeFileContent;

  // Timer ref for debounced word count + language loading
  const debouncedUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useAutoSave();
  useAIStream();
  useRecoveryDraft();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: `Start writing, or press ${modKey}K to ask AI...`,
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
      SearchAndReplace,
    ],
    content: "",
    onUpdate: ({ editor }) => {
      const { activeFilePath: currentPath } = useFilesStore.getState();
      if (currentPath) {
        const content = editor.getHTML();
        useFilesStore.setState({
          activeFilePath: currentPath,
          activeFileContent: content,
          isDirty: true,
        });
      }

      // Debounce expensive word count + language detection
      if (debouncedUpdateRef.current) clearTimeout(debouncedUpdateRef.current);
      debouncedUpdateRef.current = setTimeout(() => {
        if (editor.isDestroyed) return;
        const words = editor.state.doc.textContent.match(/\S+/g);
        setWordCount(words ? words.length : 0);
        loadLanguagesForDoc(editor);
      }, UPDATE_DEBOUNCE_MS);
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

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debouncedUpdateRef.current) clearTimeout(debouncedUpdateRef.current);
    };
  }, []);

  useEffect(() => {
    setEditor(editor);
    return () => setEditor(null);
  }, [editor, setEditor]);

  // Load content when active file changes (reads from ref to avoid
  // re-running on every keystroke which would clobber the editor).
  useEffect(() => {
    if (!activeFilePath) {
      setWordCount(0);
      return;
    }

    const content = contentRef.current;
    if (editor && content !== undefined) {
      const currentContent = editor.getHTML();
      if (currentContent !== content) {
        editor.commands.setContent(content || "");
        const words = editor.state.doc.textContent.match(/\S+/g);
        setWordCount(words ? words.length : 0);
        loadLanguagesForDoc(editor);
      }
    }
  }, [editor, activeFilePath, setWordCount]);

  if (!activeFilePath) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <p className="text-lg mb-2">No document open</p>
          <p className="text-sm">
            Select a file from the sidebar or press{" "}
            <kbd className="px-2 py-0.5 bg-surface-2 rounded text-xs">{modKey}K</kbd> to get started
          </p>
        </div>
      </div>
    );
  }

  return <EditorContent editor={editor} className="flex-1" />;
}
