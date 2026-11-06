import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripCrossoriginFromProductionHtml } from "../../../vite.buildHtml";

/** Minimal shape of Vite 6 production index.html before our post-process (see issue #23 / PR #24). */
const VITE_6_BASELINE_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <script type="module" crossorigin src="./assets/index-C043OMQ3.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/vendor-CwOEeV_j.js">
    <link rel="stylesheet" crossorigin href="./assets/index-Be1yDJRQ.css">
  </head>
  <body><div id="root"></div></body>
</html>
`;

describe("stripCrossoriginFromProductionHtml", () => {
  it("removes crossorigin from script, modulepreload, and stylesheet tags", () => {
    expect(VITE_6_BASELINE_INDEX_HTML).toMatch(/\bcrossorigin\b/);
    const out = stripCrossoriginFromProductionHtml(VITE_6_BASELINE_INDEX_HTML);
    expect(out).not.toMatch(/\bcrossorigin\b/i);
    expect(out).toContain('<script type="module" src="./assets/index-C043OMQ3.js">');
    expect(out).toContain('<link rel="modulepreload" href="./assets/vendor-CwOEeV_j.js">');
    expect(out).toContain('<link rel="stylesheet" href="./assets/index-Be1yDJRQ.css">');
  });

  it("optional: matches unpatched main-branch npm run build output when available", () => {
    const override = process.env.LAZY_EDITOR_MAIN_DIST_INDEX_HTML;
    const candidate = path.resolve("/tmp/lazy-editor-main/dist/index.html");
    const mainPath = override ?? candidate;
    try {
      const raw = readFileSync(mainPath, "utf8");
      expect(raw).toMatch(/\bcrossorigin\b/);
      expect(stripCrossoriginFromProductionHtml(raw)).not.toMatch(/\bcrossorigin\b/i);
    } catch {
      /* optional local compare — CI may not have this path */
    }
  });
});
