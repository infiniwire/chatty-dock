# Automatic updates

Installed ChattyDock clients check stable GitHub Releases shortly after startup. A newer release downloads in the background, its SHA-512 digest is verified by electron-updater, then the app saves settings and session storage, installs silently, and restarts automatically.

Git commits alone are not updates: maintainers must publish a newer semantic-version Release containing compatible installers and metadata. Install ChattyDock manually when moving from an experimental application with a different application identity. Offline profile-folder migration can preserve existing settings and website sessions.

## Client behavior

- No update confirmation or installer wizard is shown for a normal per-user Windows installation.
- Existing file downloads finish before automatic installation begins.
- Settings, profiles, cookies and website storage are flushed before the updater is allowed to quit.
- Readiness is checked again after that asynchronous flush. A new file transfer defers installation and is allowed to finish; updater errors invalidate pending installation work so it cannot install or overwrite a newer retry's status.
- Unsent text inside the website is not saved by the wrapper. The requested automatic restart can discard unsent text; avoid leaving drafts across startup updates.
- Failed checks/downloads leave the current app usable and report a non-sensitive status in Settings.
- Downgrades and prerelease updates are disabled.
- Development and ordinary integration-test launches do not install updates.
- “Check for updates” performs a real check rather than opening the website.

## Repository access

Updates use the public `infiniwire/chatty-dock` GitHub Releases feed. A GitHub account, GitHub CLI, or access token is not required. Existing environment tokens and previously saved update credentials are not read or sent by the updater. The repository and release assets must remain publicly accessible for anonymous checks to work.

Older versions require a GitHub credential even for this public repository. To receive this change, download and install the new release manually once. Existing profiles and app data are retained by the installer; the old encrypted `update-token.enc` file is left untouched and is no longer used.

## Platform requirements

Windows uses electron-updater's NSIS updater. Packages are installed per user without elevation. Filesystem permissions, enterprise policy and OS security can still prevent an installation; the application does not disable these controls.

macOS uses the standard Squirrel.Mac updater through electron-updater. A Developer ID signed build is required. The initial ad-hoc packages are detected and show a manual-update requirement instead of claiming automatic installation works. Configure the signing/notarization secrets from [releases](releases.md) and enable signed builds to distribute auto-updatable Mac clients. The old ad-hoc installation needs a manual migration to the properly signed build.

## Release assets

Each release contains the five existing installers/archives plus:

- `latest.yml`: Windows update metadata.
- `latest-mac.yml`: merged metadata for Intel and Apple Silicon ZIP/DMG files.
- `SHA256SUMS.txt`: checksums for the five packages and both metadata files.

The collector generates one merged Mac metadata document from the actual files; one architecture cannot overwrite the other's manifest. Metadata uses the SDK-compatible YAML format (JSON is valid YAML). Full downloads and SHA-512 validation are retained across public GitHub redirects.

## Validation

Unit tests cover lifecycle ordering, overlapping checks, waiting for transfers, silent/relaunch arguments, failure handling, redaction, digest metadata and architecture merging.

`npm run test:public-update` checks the real public release feed from an isolated Electron profile with no GitHub credentials, with downloading and installation disabled for the probe. `npm run test:update-install` runs only on isolated Windows CI. The release workflow runs both in a dedicated job, in parallel with the platform builds; ordinary main/PR CI does not repeat the installation test. Publication requires both the build matrix and this installation job to succeed. The installation test builds two dedicated test-product NSIS installers, installs the older version into a test directory, and serves a GitHub-compatible release feed locally. The real public GitHub provider downloads and validates the newer installer without authorization, then installs and relaunches it. The app's startup version and persistent profile ID are verified. Test products use their own name, app ID, install directory and user data; production installations are not used.

This Windows installation test does not establish signed macOS installation behavior. The Mac credential requirement must be satisfied and verified separately.
