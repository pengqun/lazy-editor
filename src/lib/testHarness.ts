import { useEditorStore } from "../stores/editor";
import { useFilesStore } from "../stores/files";

export type LazyTestApi = {
  openByPath: (path: string) => Promise<void>;
  save: () => Promise<void>;

  setHtml: (html: string) => void;
  getHtml: () => string;

  focus: () => void;
  selectAll: () => void;

  // Formatting
  toggleBold: () => void;
  toggleHeading: (level: 1 | 2 | 3) => void;
  toggleBulletList: () => void;
  toggleBlockquote: () => void;
  insertHorizontalRule: () => void;

  // History
  undo: () => void;
  redo: () => void;
};

function getEditor() {
  return useEditorStore.getState().editor;
}

export function installTestHarness() {
  if (typeof window === "undefined") return;

  const w = window as any;
  if (w.__LAZY_TEST__) return;

  const api: LazyTestApi = {
    openByPath: async (path) => {
      const s = useFilesStore.getState();
      const anyState = s as any;
      if (typeof anyState.openFileByPath === "function") {
        await anyState.openFileByPath(path);
      } else {
        await s.openFile(path);
      }
    },

    save: async () => {
      await useFilesStore.getState().saveFile();
    },

    setHtml: (html) => {
      const editor = getEditor();
      editor?.commands.setContent(html);
    },

    getHtml: () => {
      const editor = getEditor();
      return editor?.getHTML() ?? "";
    },

    focus: () => {
      const editor = getEditor();
      editor?.commands.focus();
    },

    selectAll: () => {
      const editor = getEditor();
      editor?.commands.selectAll();
    },

    toggleBold: () => {
      const editor = getEditor();
      editor?.chain().focus().toggleBold().run();
    },

    toggleHeading: (level) => {
      const editor = getEditor();
      editor?.chain().focus().toggleHeading({ level }).run();
    },

    toggleBulletList: () => {
      const editor = getEditor();
      editor?.chain().focus().toggleBulletList().run();
    },

    toggleBlockquote: () => {
      const editor = getEditor();
      editor?.chain().focus().toggleBlockquote().run();
    },

    insertHorizontalRule: () => {
      const editor = getEditor();
      editor?.chain().focus().setHorizontalRule().run();
    },

    undo: () => {
      const editor = getEditor();
      editor?.chain().focus().undo().run();
    },

    redo: () => {
      const editor = getEditor();
      editor?.chain().focus().redo().run();
    },
  };

  w.__LAZY_TEST__ = api;
}
