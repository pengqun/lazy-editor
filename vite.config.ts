import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { stripCrossoriginFromProductionHtml } from "./vite.buildHtml";

const host = process.env.TAURI_DEV_HOST;

/**
 * Strip `crossorigin` from emitted HTML (production only). Compare against an
 * unpatched `dist/index.html` from the same Vite version to see the delta.
 */
function tauriProductionStripCrossorigin(): Plugin {
  return {
    name: "tauri-production-strip-crossorigin",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html) {
      return stripCrossoriginFromProductionHtml(html);
    },
  };
}

export default defineConfig(async ({ command }) => ({
  plugins: [react(), ...(command === "build" ? [tauriProductionStripCrossorigin()] : [])],
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
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("highlight")) {
            console.log(`[manualChunks] highlight id: ${id}`);
          }
          if (id.includes("highlight.js/lib/languages/") || id.includes("highlight.js/es/languages/")) {
            if (id.includes("plaintext")) return "editor-highlight";
            const m = id.match(/languages\/([^/.]+)/);
            if (m) return `hljs-${m[1]}`;
          }
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
