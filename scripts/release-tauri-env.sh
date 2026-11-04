#!/usr/bin/env bash
# Append optional Tauri env vars to GITHUB_ENV only when non-empty (unset ≠ empty string).
set -euo pipefail

write_env_if_set() {
  local name="$1"
  local value="${2:-}"
  if [ -n "$value" ]; then
    {
      echo "${name}<<RELEASE_ENV_EOF"
      printf '%s\n' "$value"
      echo "RELEASE_ENV_EOF"
    } >> "${GITHUB_ENV}"
  fi
}

write_env_if_set APPLE_SIGNING_IDENTITY "${APPLE_SIGNING_IDENTITY:-}"
write_env_if_set TAURI_SIGNING_PRIVATE_KEY "${TAURI_SIGNING_PRIVATE_KEY:-}"
write_env_if_set TAURI_SIGNING_PRIVATE_KEY_PASSWORD "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
