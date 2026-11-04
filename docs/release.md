# Release Process

Lazy Editor uses a tag-triggered GitHub Actions workflow to build, optionally sign/notarize, and publish macOS releases.

## How Releases Work

1. Bump version in all manifests (`npm run version:bump -- X.Y.Z`) and commit.
2. Push a semver tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
3. The [`Release` workflow](../.github/workflows/release.yml) builds on `macos-14` for `aarch64-apple-darwin`.
4. Artifacts are uploaded to the workflow run; **tag pushes** also publish a GitHub Release.

Pre-release builds (pushed to `release/**` branches) or manual [`workflow_dispatch`](https://github.com/pengqun/lazy-editor/actions/workflows/release.yml) runs produce artifacts only (no GitHub Release).

## macOS signing: dual path

The workflow chooses one of three modes automatically:

| Mode | When | Result |
|------|------|--------|
| **unsigned** | No `.p12` certificate secrets (or invalid base64) | Unsigned `.dmg` / `.app` — OK for internal QA; Gatekeeper will warn end users. |
| **signed-only** | Certificate secrets present, notarization credentials incomplete | Code-signed build without notarization (workflow logs a warning). |
| **signed-notarized** | Certificate + full notarization credentials | Signed build with Apple notarization; CI runs `codesign`, `spctl`, and `stapler validate`. |

The selected mode is written to the Actions **job summary** and logged before the Tauri build.

### Required secrets (signed + notarized)

Configure in **Settings → Secrets and variables → Actions**:

| Secret | Required for | Description |
|--------|----------------|-------------|
| `APPLE_CERTIFICATE_P12_BASE64` | Signing | Base64-encoded `.p12` (Developer ID Application cert + private key). |
| `APPLE_CERTIFICATE_PASSWORD` | Signing | Password used when exporting the `.p12`. |
| `APPLE_SIGNING_IDENTITY` | Optional | Common Name, e.g. `Developer ID Application: Your Name (TEAMID)`. Tauri v2 can infer this from the certificate if omitted. |

**Notarization (choose one method):**

| Secret | Method | Description |
|--------|--------|-------------|
| `APPLE_ID` | Apple ID | Apple account email for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple ID | App-specific password from [appleid.apple.com](https://appleid.apple.com/account/manage). |
| `APPLE_TEAM_ID` | Apple ID | 10-character Team ID from Apple Developer membership. |
| `APPLE_API_ISSUER` | App Store Connect API | Issuer ID from Users and Access → Integrations. |
| `APPLE_API_KEY` | App Store Connect API | Key ID for the downloaded `.p8`. |
| `APPLE_API_KEY_BASE64` | App Store Connect API | Base64-encoded contents of the `.p8` private key file. |

**Tauri updater (optional but recommended for tag releases):**

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Minisign private key for update bundle signatures (see [Tauri updater docs](https://v2.tauri.app/plugin/updater/)). |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the updater signing key, if any. |

### Generating the certificate secret

```bash
# Export Developer ID Application from Keychain Access as .p12, then:
base64 -i DeveloperIDApplication.p12 | pbcopy
# Paste as APPLE_CERTIFICATE_P12_BASE64 in GitHub.
```

### Generating an app-specific password

1. Go to [appleid.apple.com](https://appleid.apple.com/account/manage) → Sign-In and Security → App-Specific Passwords.
2. Generate a password and save it as `APPLE_APP_SPECIFIC_PASSWORD`.

## Re-triggering a release

- **New tag** (official): bump manifests, commit, `git tag vX.Y.Z && git push origin vX.Y.Z`.
- **Same tag** (only if you deleted the remote tag first): `git push --delete origin vX.Y.Z`, fix the issue, re-tag and push.
- **Manual / QA**: Actions → Release → **Run workflow** (optionally from a `release/**` branch) — artifacts only unless you push a version tag.

## Unsigned builds (forks & internal testing)

If certificate secrets are missing, the workflow:

- Emits `::warning::` annotations in the log.
- Skips Apple env vars so Tauri does not attempt `security import` with empty values (see issue #9).
- Still uploads unsigned artifacts for download from the workflow run.

## Bundle Targets

The Tauri build produces:

- `.dmg` — Disk image for drag-and-drop installation.
- `.app` — Raw application bundle.
- `.app.tar.gz` (+ `.sig` when updater signing key is configured) — Tauri updater artifacts.

Configured in `src-tauri/tauri.conf.json` under `bundle.targets`.
