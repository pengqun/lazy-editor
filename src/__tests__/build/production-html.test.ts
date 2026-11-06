import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression for macOS WKWebView: bundled `index.html` must not use
 * `crossorigin` on module scripts/stylesheets (Vite defaults), which can block
 * execution when assets load via Tauri's `asset://` protocol.
 */
describe("production HTML / Vite Tauri asset loading", () => {
  it("keeps a build hook that strips crossorigin from emitted index.html", () => {
    const vitePath = path.resolve(__dirname, "../../../vite.config.ts");
    const src = readFileSync(vitePath, "utf8");
    expect(src).toContain("transformIndexHtml");
    expect(src).toContain("crossorigin");
    expect(src).toContain("modulePreload: false");
  });

  it("dist/index.html has no crossorigin when a production build exists", () => {
    const htmlPath = path.resolve(__dirname, "../../../dist/index.html");
    if (!existsSync(htmlPath)) {
      return;
    }
    const html = readFileSync(htmlPath, "utf8");
    expect(html).not.toMatch(/\bcrossorigin\b/i);
  });
});
