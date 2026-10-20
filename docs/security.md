# Security and privacy

## Local and remote code

- Remote content has no Node integration and no local IPC bridge.
- A sandboxed remote preload exposes no page API. On exact ChatGPT origins it pins only the non-secret `codex_app_mode` UI cookie to the current window's session storage. Cookie access for sign-in and other preferences remains native. A finite UI enum is reported through an owning-main-frame-validated console marker, never through a command bridge or cookie dump.
- Context isolation, process sandboxing, and normal web security remain enabled.
- Local IPC validates the registered sending WebContents, main frame, URL, and command payload.
- Navigation policies parse URLs and match explicit hosts, not substrings.
- The top-level website container allows only exact HTTPS ChatGPT hosts and the explicitly listed sign-in hosts. Other HTTP/HTTPS destinations, including Twitter/X, open in the system default browser. URL credentials and unsafe protocols are rejected; blank, file, data, JavaScript and custom-protocol popups are denied.
- Main-frame clicks, scripted navigation, popup creation and redirects share this boundary. A per-profile request guard also covers the initial popup request and programmatic navigation/history APIs; denied programmatic requests return to the last safe address instead of rendering an external page. Subresources, uploads and native downloads retain their normal website pipeline.
- Authentication popups inherit their initiating session and stay sandboxed.
- Outgoing ChatGPT requests replace only the window's UI-mode cookie so a reload cannot pick up a sibling's last selection. Authentication cookie values are retained. There is no general interception of BroadcastChannel messages, storage events or authentication flows.
- The observed Google sign-in bridge allows only exact HTTPS `accounts.youtube.com`. It does not admit `youtube.com`, `www.youtube.com`, `youtu.be`, arbitrary subdomains or lookalike hosts.
- Certificate verification and website access controls are not bypassed.

## Permissions

Unnecessary permissions are denied. Microphone/camera requests from the permitted content origin require a native approval dialog and remain subject to operating system approval. Passive permission checks do not auto-grant access. Screen capture and other permissions are not automatically enabled.

## Data

Settings, session partitions, and bounded finished-download metadata live in Electron's per-user `userData` directory. Typical roots are `%APPDATA%/ChattyDock` on Windows and `~/Library/Application Support/ChattyDock` on macOS. The runtime's actual configured path is authoritative.

The wrapper does not log cookies, tokens, conversation contents, attachments, or full download URLs. It provides no application-owned upload service or telemetry. The embedded website makes its own network requests under its own policies.

Optional sign-in diagnostics retain at most 64 top-level origin/routing records per window in memory. They exclude paths, query strings, URL credentials, fragments, cookies, request bodies and page content. Copying a report is an explicit local action; nothing is sent automatically. Diagnostic launch mode uses a separate data directory and does not import the installed app's browser sessions.

Profile deletion clears cookies/storage/cache. It does not securely erase disk media or delete downloaded files. Signing out of the website and deleting a local profile do not delete the website account or cloud conversation history.

## Builds

Dependencies and packaged artifacts exclude local browser data, signing credentials, test evidence, and development logs. CI for pull requests uses read-only permissions. Release publication alone receives repository write access. Signing secrets are confined to trusted release packaging jobs. No release secrets are supplied to pull-request tests.

## Reporting

Report security issues privately to the repository owner before public disclosure. Do not include real account cookies, authentication tokens, or conversation contents in reports.
