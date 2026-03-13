#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.artifacts/test-diagnose"
TS="$(date +"%Y%m%d-%H%M%S")"
RUN_DIR="$ARTIFACT_DIR/$TS"
SUMMARY_FILE="$RUN_DIR/summary.log"

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
  fi

  echo "$name=$rc" >>"$RUN_DIR/exit-codes.env"
}

RUN_FRONTEND_TESTS="$(normalize_bool "$RUN_FRONTEND_TESTS")"
RUN_RUST_TESTS="$(normalize_bool "$RUN_RUST_TESTS")"
VITEST_VERBOSE="$(normalize_bool "$VITEST_VERBOSE")"
REPEAT_COUNT="$(normalize_repeat_count "$REPEAT_COUNT_RAW")"

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
  echo "node: $(node -v 2>&1 || true)"
  echo "npm: $(npm -v 2>&1 || true)"
  echo "vitest: $(npx vitest --version 2>&1 || true)"
  echo "rustc: $(rustc --version 2>&1 || true)"
  echo "cargo: $(cargo --version 2>&1 || true)"
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
