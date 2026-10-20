# Changelog

## 0.2.2

- Add a compact window-layout menu next to Downloads, with fill, half-screen and quarter-screen positions plus restore.
- Arrange only the current window within its display's usable work area, keeping ChatGPT and other windows intact.
- Preserve smaller snapped-window sizes without invalidating stored profiles or settings.
- Show the installed version in the native title bar, for example `ChattyDock v0.2.2 — Personal`.
- Set explicit Windows taskbar identity, relaunch command and icon, with separate development/test identities.
- Bundle the Windows ICO resource used by pinned taskbar entries.
- Record Google consent HTTP 400 as deferred issue AUTH-001; Google authentication is not fixed in this release.

## 0.2.1

- Refresh the toolbar, downloads, profile management and settings in light and dark themes.
- Add a themed profile dropdown with keyboard navigation and direct access to profile management.
- Replace website navigation with a single close control while app panels are open.
- Use smaller, lighter toolbar text while retaining per-window chat font detection.
- Add a compact About page with the installed version, update status, release notes and project links.
- Show bounded, plain-text update release metadata and the last successful update check.
- Keep the download save-location switch responsive while settings are saved.
- Replace the application icon with a monochrome double-window design.

Windows packages are unsigned. macOS packages are ad-hoc signed and not notarized; automatic installation on macOS still requires a future Developer ID signed release. Private releases require GitHub access.
