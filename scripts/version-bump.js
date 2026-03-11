#!/usr/bin/env node

// Bump version across package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml.
// Usage: node scripts/version-bump.js <version>

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
if (!version) {
  console.error("Usage: npm run version:bump -- <version>");
  console.error("Example: npm run version:bump -- 0.1.6");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid semver: "${version}" (expected X.Y.Z)`);
  process.exit(1);
}

function updateJson(rel, key) {
  const path = resolve(root, rel);
  const data = JSON.parse(readFileSync(path, "utf-8"));
  const old = data[key];
  data[key] = version;
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ${rel}: ${old} -> ${version}`);
}

function updateCargo(rel) {
  const path = resolve(root, rel);
  const text = readFileSync(path, "utf-8");
  const match = text.match(/^version\s*=\s*"([^"]+)"/m);
  const old = match ? match[1] : "???";
  const updated = text.replace(
    /^(version\s*=\s*)"[^"]+"/m,
    `$1"${version}"`
  );
  writeFileSync(path, updated);
  console.log(`  ${rel}: ${old} -> ${version}`);
}

console.log(`Bumping version to ${version}:\n`);

updateJson("package.json", "version");
updateJson("src-tauri/tauri.conf.json", "version");
updateCargo("src-tauri/Cargo.toml");

console.log("\nDone. Don't forget to commit and tag:");
console.log(`  git add -A && git commit -m "chore: bump version to ${version}"`);
console.log(`  git tag v${version}`);
