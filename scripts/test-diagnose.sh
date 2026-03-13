#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.artifacts/test-diagnose"
TS="$(date +"%Y%m%d-%H%M%S")"
RUN_DIR="$ARTIFACT_DIR/$TS"
SUMMARY_FILE="$RUN_DIR/summary.log"
INDEX_MD_FILE="$RUN_DIR/index.md"
SUMMARY_JSON_FILE="$RUN_DIR/summary.json"
COMMANDS_TSV_FILE="$RUN_DIR/commands.tsv"
FAILED_LOGS_FILE="$RUN_DIR/failed-logs.txt"
HISTORY_FILE="$ARTIFACT_DIR/history.json"
HISTORY_LIMIT=20

RUN_FRONTEND_TESTS="${RUN_FRONTEND_TESTS:-true}"
RUN_RUST_TESTS="${RUN_RUST_TESTS:-true}"
VITEST_VERBOSE="${VITEST_VERBOSE:-false}"
REPEAT_COUNT_RAW="${REPEAT_COUNT:-1}"
MAX_REPEAT_COUNT=5

mkdir -p "$RUN_DIR"

log() {
  printf '[%s] %s\n' "$(date +"%Y-%m-%d %H:%M:%S")" "$*" | tee -a "$SUMMARY_FILE"
}

warn() {
  printf '[%s] %s\n' "$(date +"%Y-%m-%d %H:%M:%S")" "$*" | tee -a "$SUMMARY_FILE" >&2
}

normalize_bool() {
  local v="${1:-}"
  v="$(printf '%s' "$v" | tr '[:upper:]' '[:lower:]')"
  case "$v" in
    true|1|yes|y|on) echo "true" ;;
    false|0|no|n|off|"") echo "false" ;;
    *)
      warn "⚠️ Invalid boolean value '$1', fallback to false"
      echo "false"
      ;;
  esac
}

normalize_repeat_count() {
  local v="${1:-1}"
  if ! [[ "$v" =~ ^[0-9]+$ ]]; then
    warn "⚠️ Invalid repeat_count '$v', fallback to 1"
    echo 1
    return
  fi

  if [ "$v" -lt 1 ]; then
    warn "⚠️ repeat_count < 1, clamp to 1"
    echo 1
    return
  fi

  if [ "$v" -gt "$MAX_REPEAT_COUNT" ]; then
    warn "⚠️ repeat_count > $MAX_REPEAT_COUNT, clamp to $MAX_REPEAT_COUNT"
    echo "$MAX_REPEAT_COUNT"
    return
  fi

  echo "$v"
}

run_cmd() {
  local name="$1"
  shift
  local logfile="$RUN_DIR/${name}.log"

  log "▶ Running: $name"
  log "  $*"

  (
    set +e
    "$@"
  ) >"$logfile" 2>&1
  local rc=$?

  if [ $rc -eq 0 ]; then
    log "✅ $name passed"
  else
    log "❌ $name failed (exit $rc)"
    log "   log: $logfile"
    printf '%s\n' "$logfile" >>"$FAILED_LOGS_FILE"
  fi

  echo "$name=$rc" >>"$RUN_DIR/exit-codes.env"
  printf '%s\t%s\t%s\t%s\n' "$name" "$rc" "$([ $rc -eq 0 ] && echo passed || echo failed)" "$logfile" >>"$COMMANDS_TSV_FILE"
}

generate_indexes() {
  local generated_at
  generated_at="$(date -Iseconds)"

  RUN_DIR="$RUN_DIR" \
  ROOT_DIR="$ROOT_DIR" \
  SUMMARY_JSON_FILE="$SUMMARY_JSON_FILE" \
  INDEX_MD_FILE="$INDEX_MD_FILE" \
  COMMANDS_TSV_FILE="$COMMANDS_TSV_FILE" \
  FAILED_LOGS_FILE="$FAILED_LOGS_FILE" \
  HISTORY_FILE="$HISTORY_FILE" \
  HISTORY_LIMIT="$HISTORY_LIMIT" \
  GENERATED_AT="$generated_at" \
  RUN_FRONTEND_TESTS="$RUN_FRONTEND_TESTS" \
  RUN_RUST_TESTS="$RUN_RUST_TESTS" \
  VITEST_VERBOSE="$VITEST_VERBOSE" \
  REPEAT_COUNT="$REPEAT_COUNT" \
  REPEAT_COUNT_RAW="$REPEAT_COUNT_RAW" \
  MAX_REPEAT_COUNT="$MAX_REPEAT_COUNT" \
  NODE_VERSION="$NODE_VERSION" \
  NPM_VERSION="$NPM_VERSION" \
  VITEST_VERSION="$VITEST_VERSION" \
  RUSTC_VERSION="$RUSTC_VERSION" \
  CARGO_VERSION="$CARGO_VERSION" \
  node <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baselineModule = await import(
  pathToFileURL(path.join(process.env.ROOT_DIR, "scripts/test-diagnose-baseline.mjs")).href
);
const {
  appendHistory,
  buildCurrentRunRecord,
  buildStabilityBaseline,
  parseCommandsTsv,
  renderStabilityBaselineMarkdown,
} = baselineModule;

const commandsFile = process.env.COMMANDS_TSV_FILE;
const failedLogsFile = process.env.FAILED_LOGS_FILE;
const summaryJsonFile = process.env.SUMMARY_JSON_FILE;
const indexMdFile = process.env.INDEX_MD_FILE;
const historyFile = process.env.HISTORY_FILE;
const historyLimit = Number(process.env.HISTORY_LIMIT);

const commands = fs.existsSync(commandsFile)
  ? parseCommandsTsv(fs.readFileSync(commandsFile, "utf8"))
  : [];

const failedLogs = fs.existsSync(failedLogsFile)
  ? fs.readFileSync(failedLogsFile, "utf8").split("\n").filter(Boolean)
  : [];

const runRecord = buildCurrentRunRecord({
  runDir: process.env.RUN_DIR,
  generatedAt: process.env.GENERATED_AT,
  commands,
});
const history = appendHistory({
  historyFile,
  runRecord,
  limit: historyLimit,
});
history.historyFile = historyFile;
const stabilityBaseline = buildStabilityBaseline(history, historyLimit);

const summary = {
  runDir: process.env.RUN_DIR,
  generatedAt: process.env.GENERATED_AT,
  parameters: {
    runFrontendTests: process.env.RUN_FRONTEND_TESTS,
    runRustTests: process.env.RUN_RUST_TESTS,
    vitestVerbose: process.env.VITEST_VERBOSE,
    repeatCount: Number(process.env.REPEAT_COUNT),
    repeatCountRaw: process.env.REPEAT_COUNT_RAW,
    maxRepeatCount: Number(process.env.MAX_REPEAT_COUNT),
  },
  versions: {
    node: process.env.NODE_VERSION,
    npm: process.env.NPM_VERSION,
    vitest: process.env.VITEST_VERSION,
    rustc: process.env.RUSTC_VERSION,
    cargo: process.env.CARGO_VERSION,
  },
  commands,
  failedLogs,
  stabilityBaseline,
};

const lines = [];
lines.push("# Test Diagnose Index");
lines.push("");
lines.push(`- run_dir: ${process.env.RUN_DIR}`);
lines.push(`- generated_at: ${process.env.GENERATED_AT}`);
lines.push("");
lines.push("## 执行参数");
lines.push(`- run_frontend_tests: ${process.env.RUN_FRONTEND_TESTS}`);
lines.push(`- run_rust_tests: ${process.env.RUN_RUST_TESTS}`);
lines.push(`- vitest_verbose: ${process.env.VITEST_VERBOSE}`);
lines.push(`- repeat_count: ${process.env.REPEAT_COUNT}`);
lines.push(`- repeat_count_raw: ${process.env.REPEAT_COUNT_RAW}`);
lines.push(`- max_repeat_count: ${process.env.MAX_REPEAT_COUNT}`);
lines.push("");
lines.push("## 环境版本");
lines.push(`- node: ${process.env.NODE_VERSION}`);
lines.push(`- npm: ${process.env.NPM_VERSION}`);
lines.push(`- vitest: ${process.env.VITEST_VERSION}`);
lines.push(`- rustc: ${process.env.RUSTC_VERSION}`);
lines.push(`- cargo: ${process.env.CARGO_VERSION}`);
lines.push("");
lines.push("## 命令状态");
lines.push("| command | status | exit_code | log |");
lines.push("| --- | --- | --- | --- |");
if (commands.length === 0) {
  lines.push("| (none) | skipped | - | - |");
} else {
  for (const command of commands) {
    lines.push(`| ${command.command} | ${command.status} | ${command.exitCode ?? "-"} | ${command.logFile} |`);
  }
}
lines.push("");
lines.push(renderStabilityBaselineMarkdown(stabilityBaseline));
lines.push("");
lines.push("## 失败日志清单");
if (failedLogs.length === 0) {
  lines.push("- 无失败日志");
} else {
  for (const failedLog of failedLogs) {
    lines.push(`- ${failedLog}`);
  }
}

fs.writeFileSync(indexMdFile, `${lines.join("\n")}\n`);
fs.writeFileSync(summaryJsonFile, `${JSON.stringify(summary, null, 2)}\n`);
NODE
}

RUN_FRONTEND_TESTS="$(normalize_bool "$RUN_FRONTEND_TESTS")"
RUN_RUST_TESTS="$(normalize_bool "$RUN_RUST_TESTS")"
VITEST_VERBOSE="$(normalize_bool "$VITEST_VERBOSE")"
REPEAT_COUNT="$(normalize_repeat_count "$REPEAT_COUNT_RAW")"

NODE_VERSION="$(node -v 2>&1 || true)"
NPM_VERSION="$(npm -v 2>&1 || true)"
VITEST_VERSION="$(npx vitest --version 2>&1 || true)"
RUSTC_VERSION="$(rustc --version 2>&1 || true)"
CARGO_VERSION="$(cargo --version 2>&1 || true)"

: >"$COMMANDS_TSV_FILE"
: >"$FAILED_LOGS_FILE"

{
  echo "=== Test Diagnose Metadata ==="
  echo "timestamp: $(date -Iseconds)"
  echo "root: $ROOT_DIR"
  echo
  echo "=== Parameters ==="
  echo "run_frontend_tests: $RUN_FRONTEND_TESTS"
  echo "run_rust_tests: $RUN_RUST_TESTS"
  echo "vitest_verbose: $VITEST_VERBOSE"
  echo "repeat_count: $REPEAT_COUNT"
  echo "repeat_count_raw: $REPEAT_COUNT_RAW"
  echo "max_repeat_count: $MAX_REPEAT_COUNT"
  echo
  echo "=== Versions ==="
  echo "node: $NODE_VERSION"
  echo "npm: $NPM_VERSION"
  echo "vitest: $VITEST_VERSION"
  echo "rustc: $RUSTC_VERSION"
  echo "cargo: $CARGO_VERSION"
  echo
  echo "=== Git ==="
  echo "branch: $(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>&1 || true)"
  echo "commit: $(git -C "$ROOT_DIR" rev-parse HEAD 2>&1 || true)"
  echo "status:"
  git -C "$ROOT_DIR" status --short 2>&1 || true
  echo
} >"$RUN_DIR/meta.log"

cp "$RUN_DIR/meta.log" "$SUMMARY_FILE"

if [ "$RUN_FRONTEND_TESTS" = "false" ] && [ "$RUN_RUST_TESTS" = "false" ]; then
  log "⚠️ No test groups selected. Nothing to run."
  generate_indexes
  log "Artifacts: $RUN_DIR"
  exit 0
fi

for i in $(seq 1 "$REPEAT_COUNT"); do
  suffix=""
  if [ "$REPEAT_COUNT" -gt 1 ]; then
    suffix="-r$i"
  fi

  if [ "$RUN_FRONTEND_TESTS" = "true" ]; then
    run_cmd "npm-test${suffix}" npm --prefix "$ROOT_DIR" test
    run_cmd "npm-test-runInBand${suffix}" npm --prefix "$ROOT_DIR" test -- --runInBand

    if [ "$VITEST_VERBOSE" = "true" ]; then
      run_cmd "vitest-verbose${suffix}" npx --prefix "$ROOT_DIR" vitest run --reporter=verbose
    else
      log "⏭️ Skip vitest-verbose${suffix} (vitest_verbose=false)"
    fi
  else
    log "⏭️ Skip frontend test group (run_frontend_tests=false)"
  fi

  if [ "$RUN_RUST_TESTS" = "true" ]; then
    run_cmd "cargo-test-q${suffix}" cargo test -q --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml"
  else
    log "⏭️ Skip rust test group (run_rust_tests=false)"
  fi
done

generate_indexes

log ""
log "=== Exit Code Summary ==="
if [ -f "$RUN_DIR/exit-codes.env" ]; then
  cat "$RUN_DIR/exit-codes.env" | tee -a "$SUMMARY_FILE"
else
  log "No commands executed."
fi

if [ -f "$RUN_DIR/exit-codes.env" ] && grep -q '=[1-9][0-9]*$' "$RUN_DIR/exit-codes.env"; then
  log "Some commands failed. Check logs in: $RUN_DIR"
  exit 1
fi

log "All selected commands passed."
log "Artifacts: $RUN_DIR"
exit 0
