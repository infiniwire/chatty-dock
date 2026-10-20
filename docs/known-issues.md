# Known issues

## NAV-001: selecting Codex can change another window's page

- Status: targeted compatibility correction included in 0.2.3. Source and packaged Windows suites passed; a current real-site two-window check also passed.
- The user confirmed that an already-open sibling's actual page changes, rather than only sidebar highlighting. Live inspection did not consistently reproduce the transition because one sibling was blocked by a Sites terms modal; no terms were accepted automatically.
- Static website modules expose `codex_app_mode` as the ChatGPT/Codex surface preference and notify subscribers through `codex:preference-cookies`, with an additional focus-triggered re-read. Windows sharing a login profile share the underlying cookie store.
- The correction pins just that non-authentication preference to each window, preserves its choice on reload, and leaves shared login cookies, other preferences, BroadcastChannel and localStorage behavior intact.
- A loopback fixture models this cookie/broadcast/focus navigation. Unpinned control windows must first reproduce the cross-window page change. Patched windows must then remain on separate actual URLs, including server-rendered reloads, while a shared HttpOnly authentication fixture cookie continues to reach the server.
- Real-site check: two corrected packaged windows sharing the same diagnostic login profile were opened. Selecting Codex in window 1 left window 2 in ChatGPT; focusing and refreshing window 2 did not switch it to Codex, and returning focus to window 1 left Codex intact. No authentication prompts were automated. Only boolean outcomes are recorded in the local evidence; no conversation text or credentials are saved.
- This verifies the observed app-mode synchronization path on the current site, not every possible server-driven navigation or future upstream implementation.

## AUTH-001: Google consent opens in the system browser and returns HTTP 400

- Status: browser-dispatch cause confirmed from the user's redacted 0.2.2 trace. A targeted correction is included in 0.2.3; verification of a fresh real Google sign-in is pending.
- Reported against ChattyDock 0.2.1 while an older source development coordinator was still running.
- The user selected Google sign-in, was transferred to the system browser and reached `accounts.google.com/signin/oauth/legacy/consent`.
- Error: `400. That's an error. The server cannot process the request because it is malformed. It should not be retried.`
- A fresh, isolated, unauthenticated probe reached Google's identifier page inside the app without external-browser dispatch. This verifies only the initial redirect chain, not complete Google authentication.
- Confirmed routing defect: after Google's phone verification, a redirect from `accounts.google.com` to `accounts.youtube.com` was classified as external and handed to the system browser. This splits that navigation from the initiating Electron session. The reported browser-side HTTP 400 occurred after this handoff; the wrapper does not inspect Google's server-side rejection reason.
- The installed 0.2.2 reproduction reached Google's phone verification inside ChattyDock; after the user approved verification, the system browser opened automatically and displayed the same HTTP 400. Stale development-process behavior does not explain this reproduction.
- Correction: add only exact HTTPS `accounts.youtube.com` to the existing authentication-host allowlist. Normal YouTube/video hosts, lookalike domains, nonstandard ports and HTTP remain external. URL credentials remain blocked. The change preserves the existing session and navigation pipeline; it does not copy browser cookies or alter requests.
- The submitted trace later returns through `auth.openai.com` to `chatgpt.com`. Domain-only events do not prove account authentication succeeded and do not remove the need for a fresh manual check.
- Version 0.2.3 adds opt-in per-window domain tracing under Settings > Advanced > Diagnostics. Start recording, reproduce manually, then stop and copy the report. Reports contain origins, routing events/decisions, GET/POST/OTHER methods and numeric network errors only; no URL paths, query strings, fragments, cookies, credentials, page content or profile identifiers. Records stay in memory (up to 64) and clear on profile switch, window close or app exit. Nothing is uploaded automatically.
- Launching the application explicitly with `--diagnose-signin` starts tracing automatically in a separate diagnostic data directory and labels the native window title. This opt-in mode uses a separate application identity and disables automatic updates.
- Follow-up: in version 0.2.3 or later, manually complete a fresh Google login and verify that the account bridge stays embedded and the final authenticated ChatGPT session works. Keep external navigation restrictions and profile isolation intact.
- Local verification: 51 unit cases and 30 Windows Electron scenarios passed, including the same-profile account-bridge flow in both the main view and a popup. The corrected Windows package passed the full 30-scenario suite. Native Mac checks are a separate release gate; a fresh real provider login remains unverified.
- Do not store or replay the user's full authorization URL, cookies, query parameters, codes or tokens. Do not spoof the browser identity as a workaround.
