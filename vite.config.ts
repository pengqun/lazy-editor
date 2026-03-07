import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async ({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // For Tauri builds, use relative asset paths so the app can load from the
  // custom protocol / file-like URLs (and in selftest mode).
  base: command === "build" ? "./" : undefined,
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("lowlight") || id.includes("highlight.js")) {
            return "editor-highlight";
          }

          if (id.includes("@tiptap") || id.includes("prosemirror")) {
            return "editor-core";
          }

          if (id.includes("@tauri-apps")) {
            return "tauri-vendor";
          }

          if (
            id.includes("react") ||
            id.includes("zustand") ||
            id.includes("lucide-react")
          ) {
            return "ui-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
