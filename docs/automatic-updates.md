# Automatic updates

Installed ChattyDock clients check stable GitHub Releases shortly after startup. A newer release downloads in the background, its SHA-512 digest is verified by electron-updater, then the app saves settings and session storage, installs silently, and restarts automatically.

Git commits alone are not updates: maintainers must publish a newer semantic-version Release containing compatible installers and metadata. Install ChattyDock manually when moving from an experimental application with a different application identity. Offline profile-folder migration can preserve existing settings and website sessions.

## Client behavior

- No update confirmation or installer wizard is shown for a normal per-user Windows installation.
- Existing file downloads finish before automatic installation begins.
- Settings, profiles, cookies and website storage are flushed before the updater is allowed to quit.
- Unsent text inside the website is not saved by the wrapper. The requested automatic restart can discard unsent text; avoid leaving drafts across startup updates.
- Failed checks/downloads leave the current app usable and report a non-sensitive status in Settings.
- Downgrades and prerelease updates are disabled.
- Development and ordinary integration-test launches do not install updates.
- “Check for updates” performs a real check rather than opening the website.

## Private repository access

The repository remains private. Each client needs its own permission to read it. Credentials are resolved in this order:

1. An OS-encrypted token saved from Settings.
2. The local `GH_TOKEN` or `GITHUB_TOKEN` environment variable.
3. The local GitHub CLI login, through `gh auth token --hostname github.com`.

For a saved token, use a fine-grained GitHub token with read-only Contents access to `infiniwire/chatty-dock`. The app never displays the saved token again. Removing it falls back to the environment or CLI. Missing/expired access is shown in Settings and does not prevent chatting.

The token file is `update-token.enc` under Electron's userData folder. Encryption uses Electron safeStorage and the operating system's credential protection. Plaintext tokens are not stored in settings, logs, repository files, update manifests, or installers. No shared maintainer token is embedded in distributed clients. OS encryption must be available to save a token.

## Platform requirements

Windows uses electron-updater's NSIS updater. Packages are installed per user without elevation. Filesystem permissions, enterprise policy and OS security can still prevent an installation; the application does not disable these controls.

macOS uses the standard Squirrel.Mac updater through electron-updater. A Developer ID signed build is required. The initial ad-hoc packages are detected and show a manual-update requirement instead of claiming automatic installation works. Configure the signing/notarization secrets from [releases](releases.md) and enable signed builds to distribute auto-updatable Mac clients. The old ad-hoc installation needs a manual migration to the properly signed build.

## Release assets

Each release contains the five existing installers/archives plus:

- `latest.yml`: Windows update metadata.
- `latest-mac.yml`: merged metadata for Intel and Apple Silicon ZIP/DMG files.
- `SHA256SUMS.txt`: checksums for the five packages and both metadata files.

The collector generates one merged Mac metadata document from the actual files; one architecture cannot overwrite the other's manifest. Metadata uses the SDK-compatible YAML format (JSON is valid YAML). Full authenticated downloads are used so private GitHub differential-download redirects do not cause inconsistent updates.

## Validation

Unit tests cover lifecycle ordering, overlapping checks, waiting for transfers, silent/relaunch arguments, failure handling, redaction, digest metadata and architecture merging.

`npm run test:update-install` runs only on isolated Windows CI. It builds two dedicated test-product NSIS installers, installs the older version into a test directory, starts it against a local HTTP update feed, and waits for the updater to download, silently install and relaunch the higher version. The app's startup version and persistent profile ID are then verified. Test products use their own name, app ID, install directory and user data; production installations are not used. The script does not merely mock `quitAndInstall`.

This Windows installation test does not establish signed macOS installation behavior. The Mac credential requirement must be satisfied and verified separately.
