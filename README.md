# ChattyDock

A focused desktop home for ChatGPT: multiple windows, shared or isolated login profiles, and a native download manager.

An independent project. Not affiliated with or endorsed by OpenAI. ChatGPT is a trademark of its respective owner. This application loads the real ChatGPT website; it does not provide an API client, backend, or separate subscription.

## Platforms

| Platform | Architecture        | Package               |
| -------- | ------------------- | --------------------- |
| Windows  | x64                 | NSIS `.exe` installer |
| macOS    | Intel x64           | `.dmg` and `.zip`     |
| macOS    | Apple Silicon arm64 | `.dmg` and `.zip`     |

Download packages from this repository's Releases page. While this repository is private, downloads require repository access. Windows ARM64 and Linux are outside the initial supported target matrix.

## Features

- Multiple independent windows, coordinated by one application instance.
- Reuse the current login, select another saved profile, or create an isolated profile.
- Persistent profile names, default profile, window position, theme, website zoom, and download preferences.
- Native website file selection, file drag/drop, and clipboard image paste.
- Session-authenticated downloads with progress, cancellation, supported pause/resume, open, and reveal.
- Back/forward, reload, home, external browser access, and recoverable page errors.
- External HTTP/HTTPS links (including Twitter/X) open in the system default browser; the website container stays on ChatGPT or explicitly allowed sign-in hosts, including during popups and redirects.
- On-demand process diagnostics, without scanning conversations.
- Toolbar text automatically follows the website's chat/composer font size and zoom.

Sharing a profile shares its cookies and website storage. Signing out in one window affects the others using that profile. Separate profiles can log into separate accounts. If two profiles log into the same ChatGPT account, their cloud history still belongs to that same account.

Close a profile's windows and finish its downloads before deleting it. Deleting a profile clears its website storage and cache, not downloaded files or other profiles. Renaming a profile preserves its internal ID and login state.

## Develop

Use the Node.js version in `.node-version` / `.nvmrc` (22.23.3).

```sh
npm ci
npm run dev
```

```sh
npm run verify
npm run package:dir
npm run package:win
npm run package:mac:x64
npm run package:mac:arm64
```

Build on the target operating system. Installers go into `dist/`. An unpacked package is different from an installer and should not be distributed by itself.

See [development](docs/development.md), [architecture](docs/architecture.md), [release instructions](docs/releases.md), and [manual verification](docs/manual-tests.md).

See [verification scope](docs/validation.md) for test coverage and the distinction between local fixtures and real website checks.

## Uploads and downloads

Use ChatGPT's attachment controls normally. Files are handled by the embedded website; ChattyDock does not send them to its own server.

By default, each download opens a save dialog. Automatic saving can be enabled in Settings. Automatic filenames include a full UUID to prevent same-name collisions without synchronous directory scans. Download entries show the profile that initiated them.

Closing a window keeps its downloads running. Quitting the whole application offers to cancel active downloads. Transfers cannot resume after restarting the app. Completed metadata is bounded to 200 entries; clearing the list does not delete files. Files are opened only when requested.

## Performance and compatibility

Electron does not eliminate ChatGPT's long-conversation rendering costs. The shell avoids full-page polling, DOM rewriting, and automatic off-screen message removal. Each extra website window still consumes browser resources.

`npm run test:electron` runs real Electron integration checks against a loopback fixture and records a 500-message performance scenario in `artifacts/performance.json`. These measurements are local fixture results, not ChatGPT benchmarks. Resource samples list processes once and can include shared memory.

Some identity providers restrict embedded browsers. Authentication popups retain the initiating profile's session, but universal login compatibility is not promised. Opening a page in the system browser does not transfer its login back into the app. Website changes, service availability, account capabilities, and provider policies can affect login and attachments.

Real ChatGPT authentication, upload/download, and voice require the separate manual checklist. Local fixture checks do not certify those website behaviors.

## Privacy and security

Remote pages run sandboxed without Node integration or the local application's IPC bridge. Profiles and settings are stored in Electron's per-user application data directory. The app does not collect telemetry or conversation logs. ChatGPT's own website and privacy policies still apply. See [security and privacy](docs/security.md).

## Releases

CI validates Windows, Intel macOS, and Apple Silicon macOS. A pushed `vX.Y.Z` tag matching `package.json` triggers packaging and packaged-app tests on each native target. A final job validates all five required packages, adds SHA-256 checksums, and publishes the release only after every build succeeds.

Manual workflow dispatch builds packages without publishing. The default mode needs no signing secrets: Windows is unsigned; macOS uses ad-hoc signing and is not notarized. OS trust prompts may apply. Developer ID signing/notarization and Windows signing are optional explicit modes; failed requested signing never falls back silently. See [release setup](docs/releases.md).

Installed clients check for newer stable releases on startup, download automatically, and install silently before restarting. File downloads finish first. Private repository credentials stay on each client. macOS automatic installation requires a Developer ID signed build; ad-hoc builds show the manual-update requirement. See [automatic updates](docs/automatic-updates.md).

## License

MIT; see [LICENSE](LICENSE).
