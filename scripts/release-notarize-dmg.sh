#!/usr/bin/env bash
# Tauri notarizes/staples the .app before bundling the DMG; the DMG is signed only.
# Submit and staple the DMG when notarization credentials are configured.
set -euo pipefail

DMG_PATH="${1:-}"
if [ -z "$DMG_PATH" ]; then
  DMG_PATH=$(find src-tauri/target -type f -name "*.dmg" -path '*/bundle/*' | head -1 || true)
fi

if [ -z "$DMG_PATH" ] || [ ! -f "$DMG_PATH" ]; then
  echo "No DMG found; skipping DMG notarization."
  exit 0
fi

if xcrun stapler validate "$DMG_PATH" >/dev/null 2>&1; then
  echo "DMG already has a stapled notarization ticket: $DMG_PATH"
  exit 0
fi

echo "DMG is not stapled; submitting for notarization: $DMG_PATH"

method="${NOTARY_METHOD:-apple-id}"
if [ "$method" = "api-key" ]; then
  : "${APPLE_API_KEY:?APPLE_API_KEY is required for api-key notarization}"
  : "${APPLE_API_ISSUER:?APPLE_API_ISSUER is required for api-key notarization}"
  : "${APPLE_API_KEY_PATH:?APPLE_API_KEY_PATH is required for api-key notarization}"
  xcrun notarytool submit "$DMG_PATH" \
    --key "$APPLE_API_KEY_PATH" \
    --key-id "$APPLE_API_KEY" \
    --issuer "$APPLE_API_ISSUER" \
    --wait
else
  : "${APPLE_ID:?APPLE_ID is required for Apple ID notarization}"
  : "${APPLE_PASSWORD:?APPLE_PASSWORD is required for Apple ID notarization}"
  : "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required for Apple ID notarization}"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
fi

xcrun stapler staple "$DMG_PATH"
echo "✅ DMG notarized and stapled."
