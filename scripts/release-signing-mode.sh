#!/usr/bin/env bash
# Determines macOS release signing mode for GitHub Actions (stdout → GITHUB_OUTPUT).
# Modes: unsigned | signed-only | signed-notarized
set -euo pipefail

cert="${APPLE_CERTIFICATE_P12_BASE64:-}"
cert_pass="${APPLE_CERTIFICATE_PASSWORD:-}"
team="${APPLE_TEAM_ID:-}"
apple_id="${APPLE_ID:-}"
app_pass="${APPLE_APP_SPECIFIC_PASSWORD:-}"
api_issuer="${APPLE_API_ISSUER:-}"
api_key="${APPLE_API_KEY:-}"
api_key_b64="${APPLE_API_KEY_BASE64:-}"

missing_unsigned=()
[ -z "$cert" ] && missing_unsigned+=("APPLE_CERTIFICATE_P12_BASE64")
[ -z "$cert_pass" ] && missing_unsigned+=("APPLE_CERTIFICATE_PASSWORD")

if [ ${#missing_unsigned[@]} -gt 0 ]; then
  echo "mode=unsigned" >> "${GITHUB_OUTPUT}"
  echo "notarize=false" >> "${GITHUB_OUTPUT}"
  {
    echo "### macOS signing: **unsigned**"
    echo ""
    echo "Missing certificate secrets: ${missing_unsigned[*]}"
    echo ""
    echo "The workflow will produce unsigned artifacts (OK for internal testing)."
  } >> "${GITHUB_STEP_SUMMARY}"
  exit 0
fi

if ! echo "$cert" | base64 --decode > /dev/null 2>&1; then
  echo "::warning::APPLE_CERTIFICATE_P12_BASE64 is not valid base64 — falling back to unsigned build."
  echo "mode=unsigned" >> "${GITHUB_OUTPUT}"
  echo "notarize=false" >> "${GITHUB_OUTPUT}"
  {
    echo "### macOS signing: **unsigned** (invalid certificate secret)"
    echo ""
    echo "\`APPLE_CERTIFICATE_P12_BASE64\` could not be decoded. Fix the secret or remove it to avoid this warning."
  } >> "${GITHUB_STEP_SUMMARY}"
  exit 0
fi

has_apple_id_notary=false
if [ -n "$apple_id" ] && [ -n "$app_pass" ] && [ -n "$team" ]; then
  has_apple_id_notary=true
fi

has_api_notary=false
if [ -n "$api_issuer" ] && [ -n "$api_key" ] && [ -n "$api_key_b64" ]; then
  has_api_notary=true
fi

if $has_apple_id_notary || $has_api_notary; then
  echo "mode=signed-notarized" >> "${GITHUB_OUTPUT}"
  echo "notarize=true" >> "${GITHUB_OUTPUT}"
  if $has_api_notary; then
    echo "notary_method=api-key" >> "${GITHUB_OUTPUT}"
  else
    echo "notary_method=apple-id" >> "${GITHUB_OUTPUT}"
  fi
  {
    echo "### macOS signing: **signed + notarized**"
    echo ""
    echo "Certificate and notarization credentials are configured."
  } >> "${GITHUB_STEP_SUMMARY}"
else
  echo "mode=signed-only" >> "${GITHUB_OUTPUT}"
  echo "notarize=false" >> "${GITHUB_OUTPUT}"
  echo "notary_method=none" >> "${GITHUB_OUTPUT}"
  echo "::warning::Apple notarization credentials are incomplete. Building a signed but NOT notarized package."
  echo "::warning::Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID (or App Store Connect API secrets) for notarization."
  {
    echo "### macOS signing: **signed only** (not notarized)"
    echo ""
    echo "Certificate secrets are present; notarization credentials are missing or incomplete."
  } >> "${GITHUB_STEP_SUMMARY}"
fi
