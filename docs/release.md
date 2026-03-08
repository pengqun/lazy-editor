# Release Process

Lazy Editor uses a tag-triggered GitHub Actions workflow to build, sign, and publish macOS releases.

## How Releases Work

1. Push a semver tag: `git tag v0.2.0 && git push origin v0.2.0`
2. The `Release` workflow builds a signed + notarized macOS `.dmg` and `.app` bundle.
3. Artifacts are uploaded to the workflow run and published as a GitHub Release.

Pre-release builds (pushed to `release/**` branches) or manual dispatches produce artifacts but skip the GitHub Release publish step.

## Required GitHub Actions Secrets

Configure these in **Settings → Secrets and variables → Actions** on your GitHub repository.

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE_P12_BASE64` | Base64-encoded `.p12` file containing your Apple Developer ID Application certificate and private key. |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` file. |
| `APPLE_SIGNING_IDENTITY` | The certificate's Common Name, e.g. `Developer ID Application: Your Name (TEAMID)`. |
| `APPLE_TEAM_ID` | Your 10-character Apple Developer Team ID. |
| `APPLE_ID` | The Apple ID email used for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for the Apple ID (generated at [appleid.apple.com](https://appleid.apple.com/account/manage)). |

### Generating the certificate secret

```bash
# Export your Developer ID Application certificate from Keychain Access as a .p12 file,
# then base64-encode it:
base64 -i DeveloperIDApplication.p12 | pbcopy
# Paste the clipboard contents as APPLE_CERTIFICATE_P12_BASE64 in GitHub.
```

### Generating an app-specific password

1. Go to [appleid.apple.com](https://appleid.apple.com/account/manage) → Sign-In and Security → App-Specific Passwords.
2. Generate a new password and save it as `APPLE_APP_SPECIFIC_PASSWORD`.

## Unsigned Builds

If any of the signing secrets are missing, the workflow still runs but:

- Prints a warning in the Actions log.
- Produces **unsigned** artifacts that will trigger macOS Gatekeeper warnings ("app is damaged" / "unidentified developer").

This is useful for development/testing but not suitable for distribution.

## Bundle Targets

The Tauri build produces:

- `.dmg` — Disk image for drag-and-drop installation.
- `.app` — Raw application bundle.

These are configured in `src-tauri/tauri.conf.json` under `bundle.targets`.
