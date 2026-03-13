#!/usr/bin/env node

// Verify that the version string is consistent across manifest files.
// Optional release guard:
//   --expect <version>            (e.g. --expect 0.1.6)
//   --expect-from-tag <tagName>   (e.g. --expect-from-tag v0.1.6)

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
    fail(`Could not parse version from ${rel}`);
  }
  return match[1];
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  if (process.env.GITHUB_ACTIONS) {
    console.error(`::error::${message}`);
  }
  process.exit(1);
}

function parseArgs(argv) {
  let expectedVersion = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--expect") {
      const value = argv[i + 1];
      if (!value) {
        fail("Missing value for --expect");
      }
      expectedVersion = value;
      i += 1;
      continue;
    }

    if (arg === "--expect-from-tag") {
      const tag = argv[i + 1];
      if (!tag) {
        fail("Missing value for --expect-from-tag");
      }
      const match = tag.match(/^v(\d+\.\d+\.\d+)$/);
      if (!match) {
        fail(
          `Invalid tag \"${tag}\" (expected format: vX.Y.Z, e.g. v0.1.6)`
        );
      }
      expectedVersion = match[1];
      i += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return { expectedVersion };
}

const { expectedVersion } = parseArgs(process.argv.slice(2));

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

if (versions.size !== 1) {
  console.error("ERROR: Version mismatch detected across manifests:\n");
  for (const s of sources) {
    console.error(`  - ${s.file}: ${s.version}`);
    if (process.env.GITHUB_ACTIONS) {
      console.error(`::error file=${s.file}::version=${s.version}`);
    }
  }
  console.error(
    "\nFix with: npm run version:bump -- <X.Y.Z>\nThen re-run: npm run version:check"
  );
  process.exit(1);
}

const currentVersion = sources[0].version;

if (expectedVersion && currentVersion !== expectedVersion) {
  fail(
    `Version is ${currentVersion}, but expected ${expectedVersion}. ` +
      "Run `npm run version:bump -- <expected>` (or retag with the correct version)."
  );
}

console.log(`Version check passed: ${currentVersion}`);
if (expectedVersion) {
  console.log(`Tag expectation matched: ${expectedVersion}`);
}
