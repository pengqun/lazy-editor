#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.artifacts/test-diagnose"
TS="$(date +"%Y%m%d-%H%M%S")"
RUN_DIR="$ARTIFACT_DIR/$TS"
SUMMARY_FILE="$RUN_DIR/summary.log"

mkdir -p "$RUN_DIR"

log() {
  printf '[%s] %s\n' "$(date +"%Y-%m-%d %H:%M:%S")" "$*" | tee -a "$SUMMARY_FILE"
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

{
  echo "=== Test Diagnose Metadata ==="
  echo "timestamp: $(date -Iseconds)"
  echo "root: $ROOT_DIR"
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

run_cmd "npm-test" npm --prefix "$ROOT_DIR" test
run_cmd "npm-test-runInBand" npm --prefix "$ROOT_DIR" test -- --runInBand
run_cmd "vitest-verbose" npx --prefix "$ROOT_DIR" vitest run --reporter=verbose
run_cmd "cargo-test-q" cargo test -q --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml"

log ""
log "=== Exit Code Summary ==="
cat "$RUN_DIR/exit-codes.env" | tee -a "$SUMMARY_FILE"

if grep -q '=0$' "$RUN_DIR/exit-codes.env" && ! grep -q '=[1-9][0-9]*$' "$RUN_DIR/exit-codes.env"; then
  log "All commands passed."
  log "Artifacts: $RUN_DIR"
  exit 0
fi

log "Some commands failed. Check logs in: $RUN_DIR"
exit 1
