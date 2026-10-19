# Development

## Setup

Use Node.js 22.23.3 and npm. The lockfile is authoritative for dependency installation.

```sh
npm ci
npm run dev
```

The main process, isolated preload, and renderer are built by electron-vite. Use native decorations and platform menus. Avoid adding global keyboard or drag/drop interception to the website.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:electron
```

`npm run verify` runs those checks together. Electron tests need a desktop session, including a clipboard. Windows and macOS CI use native desktop-capable runners. The tests launch the actual app with temporary session storage, a loopback fixture, and explicit test arguments. Production startup does not allow the fixture origin unless both test switches are supplied.

Tests never access installed browser profiles or normal ChattyDock user data. They persist synthetic cookie/localStorage data across a full restart, exercise shared/isolated profiles, and inspect WebContents cleanup. Synthetic drop events test the website event pipeline; manual OS drag/drop checks are also required. Native clipboard image paste and real file-input selection are exercised through Electron/browser automation.

Evidence is written into ignored `artifacts/`, including screenshots, JSON test summaries, and performance measurements. Failure screenshots contain only fixture pages and app-owned UI. Never collect an authenticated user's conversation screenshots without authorization.

## Performance methodology

The fixture contains 500 messages, repeated code blocks, tables, controlled inline SVG images, and an 80 ms streaming-like composer update. Input timing includes browser automation overhead. Scrolling samples 120 animation frames while advancing the scroll offset. These metrics are descriptive, not guarantees or comparisons with another framework.

Resource samples are collected with three windows, one window, and after four open/close cycles. WebContents count must return to one shell and one remote view. Report platform, architecture, CPU count, and runtime versions with results. OS/GPU configuration and machine load affect timings.

## Packaging

```sh
npm run icons
npm run package:dir
npm run package:win
npm run package:mac:x64
npm run package:mac:arm64
```

Icons are generated from the monochrome, two-window master `build/icon-source.png`; PNG, ICO and ICNS outputs are committed so packaging does not need image-generation tools. `sharp` and `png-to-ico` are development-only dependencies. Keep the broad strokes and clear separation readable at 16–32 px.

Run packaged integration checks by setting `DOCK_EXECUTABLE` to the packaged executable and running `npm run test:electron`. This tests the actual ASAR-contained app and isolated preload, not just the development build.

## Dependencies

Run `npm audit` and `npm audit --omit=dev`. Do not blindly apply forced major-version or downgrade suggestions. Build-tool transitive findings must be assessed separately from shipped runtime packages. Keep Electron current and test upgrades using the same local session fixtures.

## Toolbar profile dropdown

The profile picker uses a transient, sandboxed child BrowserWindow because renderer-only popovers cannot overlap the native ChatGPT WebContentsView. The child renders the local `?surface=profile-menu` surface with the parent's theme and zoom, and closes on outside focus, parent movement/resize, or Escape. Only snapshot, profile switching, closing the menu and opening profile management are permitted from this registered child sender. Account cookies stay in the existing per-profile website partitions. The popup keeps at most seven visible profile rows before scrolling; arrow keys, Home/End and name typing move focus. Escape and Tab restore focus to the toolbar trigger.

After changes to the main process, fully quit and restart the source app to activate new IPC commands. Opening another window in an older coordinator does not reload the main process; the renderer falls back to profile management when that coordinator does not recognize the dropdown command.
