#!/usr/bin/env node

// Verify that the version string is consistent across all three manifest files.
// Exits non-zero with a diff summary on mismatch.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf-8"));
}

function readCargoVersion(rel) {
  const text = readFileSync(resolve(root, rel), "utf-8");
  const match = text.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    console.error(`ERROR: Could not parse version from ${rel}`);
    process.exit(1);
  }
  return match[1];
}

const sources = [
  { file: "package.json", version: readJson("package.json").version },
  {
    file: "src-tauri/tauri.conf.json",
    version: readJson("src-tauri/tauri.conf.json").version,
  },
  {
    file: "src-tauri/Cargo.toml",
    version: readCargoVersion("src-tauri/Cargo.toml"),
  },
];

const versions = new Set(sources.map((s) => s.version));

if (versions.size === 1) {
  console.log(`Version consistent: ${sources[0].version}`);
  process.exit(0);
}

console.error("ERROR: Version mismatch detected!\n");
for (const s of sources) {
  console.error(`  ${s.file}: ${s.version}`);
}
console.error(
  "\nRun `npm run version:bump -- <version>` to sync all files to a single version."
);
process.exit(1);
