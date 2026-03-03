import { useEditorStore } from "../stores/editor";
import { useFilesStore } from "../stores/files";

export type LazyTestApi = {
  openByPath: (path: string) => Promise<void>;
  save: () => Promise<void>;
  setHtml: (html: string) => void;
  getHtml: () => string;
  toggleBold: () => void;
  toggleHeading: (level: 1 | 2 | 3) => void;
};

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
      const editor = useEditorStore.getState().editor;
      editor?.commands.setContent(html);
    },
    getHtml: () => {
      const editor = useEditorStore.getState().editor;
      return editor?.getHTML() ?? "";
    },
    toggleBold: () => {
      const editor = useEditorStore.getState().editor;
      editor?.chain().focus().toggleBold().run();
    },
    toggleHeading: (level) => {
      const editor = useEditorStore.getState().editor;
      editor?.chain().focus().toggleHeading({ level }).run();
    },
  };

  w.__LAZY_TEST__ = api;
}
