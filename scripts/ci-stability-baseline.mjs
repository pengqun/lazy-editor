import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HISTORY_LIMIT,
  buildStabilityBaseline,
  readHistory,
  renderStabilityBaselineMarkdown,
} from "./test-diagnose-baseline.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(rootDir, ".artifacts", "test-diagnose");
const historyFile = path.join(artifactDir, "history.json");
const outputDir = path.join(artifactDir, "ci-baseline");
const markdownFile = path.join(outputDir, "stability-baseline.md");
const jsonFile = path.join(outputDir, "stability-baseline.json");

fs.mkdirSync(outputDir, { recursive: true });

const history = readHistory(historyFile);
history.historyFile = historyFile;
const baseline = buildStabilityBaseline(history, Number(history.historyLimit) || HISTORY_LIMIT);

const markdown = [
  "# CI Stability Baseline Summary",
  "",
  renderStabilityBaselineMarkdown(baseline),
  "",
].join("\n");

const payload = {
  generatedAt: new Date().toISOString(),
  historyFile,
  baseline,
};

fs.writeFileSync(markdownFile, markdown);
fs.writeFileSync(jsonFile, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Wrote markdown summary: ${markdownFile}`);
console.log(`Wrote json summary: ${jsonFile}`);
