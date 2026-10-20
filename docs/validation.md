# Verification scope

This file records verification boundaries. The current commit, CI jobs, and generated test evidence are authoritative; a build configuration alone does not prove a successful build.

ChattyDock 0.2.2 includes startup automatic updates; see [automatic update verification](automatic-updates.md) for the additional scope. Windows CI exercises a real installation and update between two isolated test-product versions, including silent installation, automatic relaunch and preservation of the profile ID.

Navigation fixture scenarios exercise same-window links, new-window links, scripted assignment/replacement, form submission, server redirects, initial and reused popups, and direct `loadURL`. The test stubs Electron's `shell.openExternal` at the OS boundary and verifies each expected dispatch, unchanged safe container URLs, zero requests to a blocked external server, and working third-party subresources. It does not launch a real system browser or certify real account sign-in.

## Local checks

Version 0.2.3 includes 51 unit cases and 30 Electron scenarios on Windows (28 on Mac). The source and packaged Windows suites passed locally. Native release jobs independently repeat the checks on Windows x64, Intel Mac and Apple Silicon Mac; their actual job results are the release evidence. A separate diagnostic-mode launch check verifies its title, test-data isolation, automatic recording and copy/stop controls. Tests verify redaction, bounded memory and per-window ownership with synthetic inputs. They do not reproduce a real Google account's phone verification or certify a completed login.

The account-bridge regression uses an HTTPS protocol handler scoped to the fixture session, with synthetic Google → YouTube accounts → Google → OpenAI → ChatGPT responses; it makes no real identity-provider requests. Both the main view and an authentication popup preserve the initiating session, POST body and cookie store without calling `shell.openExternal`. Cookie retention is checked through Chromium's cookie store and `document.cookie`; the protocol fixture does not certify cookie headers received by a real provider. Normal YouTube browsing and lookalike hosts remain external. Real provider authentication remains a manual check.

The window-number scenario checks native titles and circular navigation badges, all seven rainbow colors and wraparound, closing intermediate windows, profile renaming, and that toolbar-menu windows do not consume numbers. Light/dark toolbar captures are saved in `artifacts/window-numbers/`. The restart scenario also verifies that the first new window starts at 1 again. Numbering is local to the running coordinator, independent of login-profile IDs and Electron window IDs.

The NAV-001 correction includes two unit cases and one Electron scenario. Its negative control verifies that unpinned loopback windows really navigate together through the modeled website preference broadcast. The corrected views preserve independent surface URLs across broadcasts, focus and a fully awaited server-rendered reload, while retaining shared ordinary cookies and a server-observed HttpOnly authentication fixture. A unit check rejects mode markers from other frames, non-content origins and unsupported values. A separate current real-site check also passed: window 1 stayed in Codex while window 2 stayed in ChatGPT after focus changes and refresh, using a shared diagnostic profile. That check covers this app-mode path, not arbitrary server-driven navigation. No live conversation contents, authentication cookie values or credentials are recorded in the evidence.

The implementation was exercised on Windows x64 with Electron 44.9.0. The local developer shell used Node.js 22.13.1; repository configuration and CI pin Node.js 22.23.3. Both satisfy the declared engine range.

- ESLint and strict TypeScript checks passed.
- The unit suite contains 51 cases for navigation, filename handling, command validation, bounds restoration, persistence, update lifecycle and bounded plain-text release metadata.
- The real Electron suite contains 30 Windows scenarios and 28 Mac scenarios, including native desktop window placement and restoration, per-window font detection, website zoom, downloads UI and file actions, shared/isolated window creation, native toolbar profile dropdowns, profile menus and inline editing, settings categories, About/version/update presentation, keyboard return and focus restoration, light/dark layouts, and session persistence across a full restart. Windows additionally checks native taskbar/shortcut metadata and OS-encrypted credential storage; the credential case is exercised through the settings form. UI captures are saved in `artifacts/ui-review/`, `artifacts/ui-round2/`, `artifacts/about/`, `artifacts/profile-dropdown/` and `artifacts/window-layout/`. About's download/release-note presentation uses a synthetic renderer snapshot; actual update event handling is unit-tested, and real installation remains the separate updater installation test.
- Window-layout source checks passed locally on Windows and in native Windows/Intel Mac/Apple Silicon CI. Packaged-app checks remain an independent release gate. Layout checks read the live display work area, and renderer-only update fixtures temporarily isolate their snapshots from normal state broadcasts.
- Each native release job repeats integration scenarios against the packaged executable.
- `npm run test:dev` checks the actual electron-vite development command and local React interaction.
- Native release jobs generate a Windows NSIS installer and Intel/Apple Silicon Mac DMG/ZIP packages, with English application metadata.
- Optional fresh-session website checks inspect the public ChatGPT homepage without signing into a real account. Fixture checks do not establish real account compatibility.

## Requirements and evidence

| Requirement group                  | Implementation                                                                  | Evidence or boundary                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1. Website wrapper and platforms   | Electron shell, real ChatGPT URL, no API client or backend                      | Public homepage check; target-specific CI and release jobs                                                                        |
| 2. Stack and English repository    | TypeScript, React, Vite, electron-builder, npm lockfile                         | Package manifests, lint/type checks, repository source                                                                            |
| 3. Process and view architecture   | Single coordinator, isolated WebContentsView, explicit cleanup                  | Real second-instance and repeated open/close tests                                                                                |
| 4. Profiles and login sharing      | UUID partitions, profile management, safe replacement/deletion                  | Real cookies/localStorage sharing, isolation, rename, switch, default and deletion tests                                          |
| 5. Navigation and authentication   | Native menu/navigation, popup policies, failure states                          | Fixture navigation and popup tests; actual provider login remains manual                                                          |
| 6. Uploads                         | Website-owned file picker, unmodified remote drag/drop and clipboard pipeline   | Real file input and OS image paste; synthetic drop fixture; OS file drag/drop remains manual                                      |
| 7. Downloads                       | Original session downloads, UUID-qualified automatic names, native save dialogs | Authenticated fixture contents, progress/pause/resume/cancel/failure, no duplicate handlers, transfer survives closing its window |
| 8. Long conversations              | Event-driven font-style sampling; no conversation text extraction or rewriting  | 500-message fixture input, 120-frame scrolling sample, process and view-count snapshots                                           |
| 9. Interface and platform behavior | Local toolbar, settings, profiles, downloads, native menus                      | Local UI interaction and screenshots; per-OS tests; full human platform checklist remains separate                                |
| 10. Security and privacy           | Sandboxed remote page, exact URL policy, sender/schema-validated IPC            | Remote bridge/Node absence and untrusted-sender rejection tests; source inspection                                                |
| 11. Packaging                      | Windows x64, Intel Mac, Apple Silicon Mac, original icons                       | Native release build jobs and packaged-app integration tests                                                                      |
| 12. Signing                        | Explicit uncredentialed versus signed modes                                     | Unsigned Windows build checked; signed credential paths are implemented but cannot be certified without credentials               |
| 13. CI                             | Native OS/architecture matrix; read-only PR permissions                         | GitHub Actions jobs for the corresponding commit                                                                                  |
| 14. Releases                       | Version gate, all-target artifact gate, checksums, single publication job       | Release workflow run and artifact manifest; publication requires a matching version-tag push                                      |
| 15. Tests                          | Real Electron fixtures and temporary browser data                               | Unit tests, integration tests, packaged tests; no mocks used to establish session isolation                                       |
| 16. Documentation                  | README, architecture/development/release/security/manual guides                 | English Markdown files, formatting checks                                                                                         |
| 17. Delivery                       | Working app, package scripts, private Git repository                            | Git history, private repository visibility, local package, CI/release evidence                                                    |

## Evidence files

`npm run test:electron` writes ignored local files under `artifacts/`:

- `electron-tests.json`: development-build integration outcomes.
- `packaged-tests.json`: packaged application outcomes.
- `performance.json`: environment, fixture size, input/scroll timings and per-process snapshots.
- `settings.png`, `new-window.png`, `dark.png`, `compact.png`: app-owned UI screenshots.

`node scripts/website-check.mjs` writes `website-check.json` with sanitized homepage status from a fresh, unauthenticated profile. `npm run test:dev` writes `development.png`. CI uploads only fixture/app-owned screenshots and reports.

Timing includes automation overhead. Working-set metrics may contain shared memory and are not exclusive physical-memory totals. The fixture is not a benchmark of ChatGPT, and these tests make no claim that very long real conversations are faster than in a browser.

## Remaining interactive verification

Real account login, provider-specific authentication, generated ChatGPT files, real attachment processing, human OS drag/drop, voice permission behavior, installer upgrade UX, and Developer ID/Authenticode signed distribution remain subject to the explicit [manual checklist](manual-tests.md). No account credentials or signing certificates were supplied during implementation.
