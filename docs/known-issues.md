# Known issues

## AUTH-001: Google consent opens in the system browser and returns HTTP 400

- Status: deferred at the user's request; not fixed.
- Reported against ChattyDock 0.2.1 while an older source development coordinator was still running.
- The user selected Google sign-in, was transferred to the system browser and reached `accounts.google.com/signin/oauth/legacy/consent`.
- Error: `400. That's an error. The server cannot process the request because it is malformed. It should not be retried.`
- A fresh, isolated, unauthenticated probe reached Google's identifier page inside the app without external-browser dispatch. This verifies only the initial redirect chain, not complete Google authentication.
- Possible causes include a browser-session handoff, stale runtime behavior or provider restrictions. The root cause is not confirmed.
- Follow-up: reproduce in a fully restarted installed build, capture only the first external destination's origin/path and event type, and verify the final callback manually. Keep external navigation restrictions and profile isolation intact.
- Do not store or replay the user's full authorization URL, cookies, query parameters, codes or tokens. Do not spoof the browser identity as a workaround.
