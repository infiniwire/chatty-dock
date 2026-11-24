# Maintenance log

All dates and release periods in this log use `America/Vancouver`. Weeks run
Monday through Sunday. Preserve previous entries when recording future runs.

## Current state

- Repository: `infiniwire/chatty-dock`; working checkout: `D:\Github\chatty-dock`.
- Release status: **v0.3.8 published**. On 2026-11-22, the user authorized normal
  pushes and releases whether the repository is public or private. Do not
  change repository visibility from this maintenance task.
- Version policy: three-part `A.B.C`. A daily emergency or weekly maintenance
  release increments `C` by one. A monthly release increments `B` by one and
  keeps `C` unchanged, as specified by adding `0.1.0`. For example, `0.2.3`
  becomes `0.2.4` for a daily or weekly release and `0.3.3` for a monthly
  release. The former four-part policy and its blocker have been superseded.
  Standard release and update validation remains mandatory before any release.
- Release workflow configuration at commit `2f7afe1` has a separate
  `update-install` job parallel to the three platform builds, and ordinary CI
  does not run the update installation test.
- UPD-004 and the SEC-001 mitigation were released in v0.3.6. The reported
  intermittent black screen still needs confirmation. TEST-002, an intermittent
  Apple Silicon integration timeout and cleanup hang, remains under investigation.
- Latest stable release: [v0.3.8](https://github.com/infiniwire/chatty-dock/releases/tag/v0.3.8),
  commit `fbd42cae423119d31941093f9b7cf06fd378caaf`. Downloaded packages and
  manifests passed checksum verification. Repository visibility is public.
- Completed periods: November 2026 monthly and the November 16–22 and
  November 23–29 weekly cycles. No release job is in progress or failed.

## 2026-11-02 — initial local assessment

- Checkout `654427e21741bc5846b57fd18a1bc7a093b2977f` matched remote `main`.
  The checkout was clean before this log was added.
- Using Node.js 22.23.3, format check, lint, TypeScript, 51 unit tests, build,
  30 Windows Electron integration checks and the development startup/UI check
  passed. These tests ran immediately before this maintenance request. The
  Electron and public-site results are in local ignored files
  `artifacts/electron-tests.json` and `artifacts/website-check.json`; the
  development screenshot is `artifacts/development.png`. These generated
  files may be overwritten by later runs.
- An isolated, unauthenticated public-site check reached `https://chatgpt.com`,
  found page content and a login entry, and detected no verification prompt.
  It does not establish authenticated functionality or ongoing compatibility.
- The GitHub connector and unauthenticated GitHub API both reported the
  repository as public. This is an operational blocker, not a scored product
  defect. No repository visibility change, push, tag or release was performed.
- No new reproducible product bug was established during this assessment.
  Known issue AUTH-001 still requires a fresh manual Google sign-in check.
- Not independently verified in this run: packaged-app checks, actual update
  installation, abnormal-exit recovery, authenticated uploads/downloads,
  voice, CAPTCHA or second-factor flows, and native macOS behavior. Existing
  historical CI results are not evidence of a fresh run.
- No release was attempted. The first monthly and weekly publication under the
  new policy remains due, but is blocked by repository visibility and version
  compatibility; do not mark either period complete.

## 2026-11-02 — version policy amended

- The user replaced the four-part policy with three-part increments of
  `0.0.1` for daily emergency or weekly maintenance releases and `0.1.0` for
  monthly releases. Adding `0.1.0` preserves the patch component.
- The previous four-part compatibility blocker no longer applies. Normal
  packaging, version comparison, installer-upgrade and release verification
  remain required. The repository visibility and release-workflow blockers
  above remain unresolved; no publication cycle was marked complete.

## 2026-11-02 — manual scheduler rehearsal

- This was a manual maintenance run, not a scheduler invocation. No active
  ChattyDock automation was found in the local automation inventory; timer
  delivery and timezone behavior remain unverified.
- Tested commit `2f7afe155947928b8f6d57e0740c7b94706e0e70`, version `0.2.4`,
  using Node.js 22.23.3. Format, lint, TypeScript, all 57 unit tests, build,
  the development startup check, and all 31 source and 31 unpacked Windows
  packaged Electron scenarios passed. The suite includes simulated abrupt-exit
  download history recovery. A temporary unauthenticated website check reached
  ChatGPT with content and a login entry, without a detected verification page.
- Evidence is stored in `artifacts/maintenance/manual-20261103T021338Z/`.
  These locally ignored files are not a substitute for a durable backup.
- No new product defect was established. Authenticated behavior, Google login,
  voice, and real provider challenges remain unverified. The real update
  installation test is restricted to isolated Windows CI and was not run locally.
- The repository was still public. No push, new tag or release was initiated
  during this manual run. The externally initiated `v0.2.4` release workflow
  subsequently completed successfully, including all three platform builds,
  the parallel Windows update installation job and collection. The stable
  release became Latest. All five downloaded packages and both manifests
  matched the SHA-256 checksum file; manifest versions and listed SHA-512
  values also matched. Evidence is in `release-v0.2.4-verification.json` in
  the directory above. The repository privacy requirement remains unmet;
  do not mark the policy release cycle fully complete on this evidence.

## 2026-11-06 — manual maintenance run

- This was a user-requested manual run; no saved ChattyDock automation was
  found in the local automation inventory, so scheduled triggering remains
  unverified. Checkout and remote main both pointed to
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`, version `0.2.4`.
- With Node.js 22.23.3, format, lint, TypeScript, build, all 57 unit tests,
  development startup, and 31 source and 31 existing unpacked Windows packaged
  Electron scenarios passed. The packaged executable was reused from the prior
  build, not rebuilt during this run.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification prompt. This does not verify signed-in
  functionality, provider authentication, real uploads/downloads, or voice.
- No new reproducible product defect was established. The real update installer
  and macOS builds were not run locally. The evidence files are in the ignored
  directory `artifacts/maintenance/manual-20261107T061458Z/`.
- The repository remained public and Latest remained `v0.2.4`. No new release,
  tag or push was initiated. Publication remains blocked by the private
  repository requirement; existing publication-cycle records were not changed.

## 2026-11-13 — manual maintenance run

- The local ChattyDock maintenance automation is now marked active and its
  recurrence specifies every day at 06:00. The stored configuration does not
  explicitly name a time zone, and actual scheduled delivery has not been
  independently verified in this run. This run was manually requested.
- Checkout and remote main matched at commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript,
  build, 57 unit tests, development startup and 31 source Electron scenarios
  passed using Node.js 22.23.3. An isolated unauthenticated ChatGPT homepage
  check found content and a login entry, with no detected verification page.
- The first launch of the previously generated unpacked Windows package failed
  in Playwright with `Process failed to launch`. After rebuilding the package,
  all 31 packaged Electron scenarios passed. The initial cause was not
  established; treat it as an unclassified test/artifact failure, not a
  confirmed product defect. Evidence is in the ignored directory
  `artifacts/maintenance/manual-20261114T035104Z/`.
- No new product defect was confirmed. Actual provider login, CAPTCHA, voice,
  macOS and an installed-client upgrade were not verified in this local run.
  The repository was public, so no release, tag or push was initiated. The
  latest observed stable release remained `v0.2.4`.

## 2026-11-14 — scheduled maintenance run

- The scheduled heartbeat was delivered at 06:02 Vancouver time, as calculated
  by Node.js 22.23.3 using IANA tzdata 2026c. This verifies a scheduled
  delivery close to 06:00 for this date. The stored recurrence does not name an
  IANA time zone, so behavior after time-zone configuration changes remains
  unverified. The host uses British Columbia Standard Time.
- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup and 31 source Electron scenarios passed.
  All 31 packaged Windows Electron scenarios also passed using the unpacked
  package rebuilt on the previous run. The isolated unauthenticated ChatGPT
  homepage check found content and a login entry, without a detected challenge.
- No new reproducible product defect was identified. Provider login, CAPTCHA,
  voice, macOS and real installed-client upgrade remain unverified locally.
  Evidence is in the ignored directory
  `artifacts/maintenance/scheduled-20261114T130515Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet.

## 2026-11-15 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup, and 31 source and 31 existing unpacked
  Windows packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261115T130447Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet.

## 2026-11-16 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup, and 31 source and 31 existing unpacked
  Windows packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261116T130540Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet. This week's
  maintenance release is due but blocked by that condition.

## 2026-11-17 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup, and 31 source and 31 existing unpacked
  Windows packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261117T125932Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet. This week's
  maintenance release remains blocked by that condition.

## 2026-11-18 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup, and 31 source and 31 existing unpacked
  Windows packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261118T130629Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet. This week's
  maintenance release remains blocked by that condition.

## 2026-11-19 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup, and 31 source and 31 existing unpacked
  Windows packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261119T125748Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet. This week's
  maintenance release remains blocked by that condition.

## 2026-11-20 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup, and 31 source and 31 existing unpacked
  Windows packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261120T130217Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet. This week's
  maintenance release remains blocked by that condition.

## 2026-11-21 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. Format, lint, TypeScript, build,
  57 unit tests, development startup, and 31 source and 31 existing unpacked
  Windows packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261121T130304Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet. This week's
  maintenance release remains blocked by that condition.

## 2026-11-21 — startup recovery and website zoom

- START-001, severity 5/10: a hanging initial website request left the native
  website area empty without an in-content retry prompt. The isolated startup
  fixture failed before the change and passed afterward. The requested
  intermittent black screen has not been reproduced against the user's real
  profile, so its root cause remains uncertain. The local mitigation and website
  zoom slider are uncommitted and awaiting release.
- Format, lint, TypeScript, 57 unit tests, source build, startup recovery test,
  and 31 Electron scenarios passed. The startup recovery test and the 31
  scenarios also passed against the rebuilt unpacked Windows package. Slider
  coverage verifies the persisted setting, keyboard control, and website zoom
  across open windows. An isolated unauthenticated ChatGPT homepage loaded.
- Evidence is in the ignored directory
  `artifacts/maintenance/startup-zoom-20261121T193820Z/`. Actual authenticated
  startup and macOS behavior remain unverified. No release or push was made;
  the required private-repository condition was previously observed unmet.

## 2026-11-22 — scheduled maintenance run

- Checkout and remote main matched commit
  `2f7afe155947928b8f6d57e0740c7b94706e0e70`. The authorized uncommitted
  START-001 mitigation and website zoom slider were retained and tested.
  Format, lint, TypeScript, build, 57 unit tests, development startup, the
  startup recovery scenario, and 31 source and 31 existing unpacked Windows
  packaged Electron scenarios passed using Node.js 22.23.3.
- The isolated unauthenticated ChatGPT homepage reported content and a login
  entry, with no detected verification page. Actual provider login, CAPTCHA,
  voice, macOS and an installed-client upgrade remain unverified locally.
- No new reproducible product defect was established. Evidence is in the
  ignored directory `artifacts/maintenance/scheduled-20261122T130150Z/`.
- The repository remained public and latest stable release remained `v0.2.4`.
  No push, tag, release or publication-period completion was performed because
  the required private-repository condition remains unmet. This week's
  maintenance release remains blocked by that condition.

## 2026-11-22 — themed application icons

- Replaced the default application icon with the approved ChatGPT-style mark
  and Dock badge, and added dark and light runtime variants. Windows window and
  taskbar icons and the macOS Dock icon follow the application theme; packaged
  shortcuts and the macOS application bundle use the default icon.
- Format, lint, TypeScript, 57 unit tests, source build, startup recovery,
  development startup and 32 source Electron scenarios passed. The startup
  recovery test and 32 Electron scenarios passed against a rebuilt Windows
  package, including theme-driven icon changes. The light and dark resources
  were present in the unpacked package. Native macOS behavior is unverified.
- A first packaged startup-test attempt timed out waiting for its initially
  selected window. The test now waits for the trusted local shell before
  interacting; the packaged rerun passed. This is recorded as a test-harness
  issue, not a confirmed product defect or a scored release trigger.
- Evidence is in the ignored directory
  `artifacts/maintenance/theme-icons-20261123T003638Z/`. The changes are
  uncommitted and unreleased; the repository remained public when checked.

## 2026-11-22 — local release preparation

- The user requested deployment, then confirmed that the repository should
  remain public for now. The prior private-only publication rule therefore
  continues to block pushing and publishing.
- Prepared the uncommitted `0.3.4` monthly release candidate from the latest
  observed stable version `0.2.4`. The candidate contains START-001's
  mitigation, the zoom slider and the themed application icons. No tag or
  release was created, and no publication cycle was marked complete.
- Candidate verification passed: formatting, lint, TypeScript, 57 unit tests,
  source build, the startup recovery scenario, and 32 Electron integration
  scenarios in both source and unpacked Windows builds. A Windows NSIS installer
  was generated locally; its SHA-256 is
  `dcb18e89e69b064ea57c06df8ec252d102e3f047efebee13b0dbadf5e3f07a45`.
  The installer is unsigned and has not been installed or tested as an upgrade.
  macOS builds, real provider authentication and the release workflow remain
  unverified for this candidate. Evidence is in the ignored directory
  `artifacts/maintenance/release-candidate-20261123T004402Z/`.

## 2026-11-22 — public release authorized

- The user explicitly replaced the private-only publication rule and
  authorized this release while the repository remains public. The recurring
  maintenance automation was updated to follow the new rule without changing
  repository visibility.
- Candidate `0.3.4` remains the outstanding monthly release. Local preparation
  and validation are in progress; no release period is complete until all
  platform builds, update installation checks and post-publication checks pass.
- The candidate passed format, lint, TypeScript, 59 unit tests, the startup
  recovery test and 32 source Electron scenarios. Its previously built Windows
  package passed the startup recovery test and 32 packaged scenarios. The
  English release notes are generated from the candidate's changelog entry.
- Existing clients still require configured GitHub credentials for update
  checks, including against the public repository. Ad-hoc macOS builds remain
  manual-update only.

## 2026-11-22 — monthly release completed

- Published stable [v0.3.4](https://github.com/infiniwire/chatty-dock/releases/tag/v0.3.4)
  from commit `cef0d0f3438702e0aa50c84e3ea6b519f864f449`. This completes the
  November 2026 monthly cycle and the weekly cycle of November 16–22. The
  repository remains public as authorized; no further release is due for this
  local date. There is no release job in progress or failed for this version.
- [Release run 45091361074](https://github.com/infiniwire/chatty-dock/actions/runs/45091361074)
  passed validation, Windows, Intel Mac and Apple Silicon Mac builds and
  packaged smoke tests, and the separate Windows silent upgrade and relaunch
  test. All eight expected release assets are present. Downloaded package and
  manifest SHA-256 checksums and the manifest SHA-512 hashes matched; both
  update manifests specify `0.3.4`. The release is stable and Latest. Evidence:
  `artifacts/maintenance/release-0.3.4-verification/release-v0.3.4-verification.json`.
- START-001's mitigation, the zoom slider and themed icons are released. The
  original intermittent black screen still needs confirmation using an actual
  affected profile. Real provider login remains unverified. The update client
  still requires GitHub credentials even for a public repository, and ad-hoc
  macOS packages require manual updates.

## 2026-11-23 — scheduled maintenance and weekly candidate

- The weekly release is due for November 23–29. Prepared `0.3.5`; publication
  remains pending until all release and post-publication checks pass. The last
  completed release is `0.3.4` on November 22. No other release was in progress.
- TEST-001 (test harness only; product severity 0/10): the Windows CI jobs in
  [run 45091330385](https://github.com/infiniwire/chatty-dock/actions/runs/45091330385)
  and [run 45092214236](https://github.com/infiniwire/chatty-dock/actions/runs/45092214236)
  failed at startup recovery because the first Playwright `window` event was
  the original fixture view, whose accessibility snapshot showed `Conversation
fixture`, rather than the new application shell. The test now identifies
  the intended shell by its window number, regardless of page event order. The
  original failure is evidenced by both CI logs; the corrected source and
  packaged tests passed locally. Remote CI validation remains pending.
- The first `0.3.5` candidate's Windows CI
  ([run 45180855092](https://github.com/infiniwire/chatty-dock/actions/runs/45180855092))
  selected the shell correctly but timed out after Retry while the remote URL
  was empty. One plausible fixture race is that the short synthetic timeout
  expires before the first stalled request reaches the server. The test now
  verifies that request arrived before Retry and verifies a second request
  afterward. This hypothesis is not yet validated on the affected CI runner;
  no product defect is claimed from this result. No tag was created.
- Using Node.js 22.23.3, format, lint, TypeScript, 59 unit tests, source build,
  development startup, startup recovery, and 32 Electron scenarios passed.
  The `0.3.5` unpacked Windows package passed startup recovery and the same 32
  scenarios using isolated test data. Results and screenshots are in the
  evidence directory below. No new product defect was confirmed.
- An isolated, unauthenticated Electron profile loaded the current ChatGPT
  homepage, with login controls and no detected verification screen. Evidence
  including its screenshot is in `artifacts/maintenance/scheduled-20261123T130004Z/`.
  Real authentication, CAPTCHA and two-factor verification were not attempted.
- The Windows host uses British Columbia time and started at 06:00 local time.
  Its Node.js ICU timezone data incorrectly reports the old winter offset for
  `America/Vancouver`: British Columbia adopted year-round daylight time in 2026. Do not use this outdated Node.js timezone data alone to decide dates
  or release periods; verify against updated timezone data or current local
  authorities. No fixed UTC offset is prescribed by this maintenance policy.

## 2026-11-23 — weekly release completed

- Published stable [v0.3.5](https://github.com/infiniwire/chatty-dock/releases/tag/v0.3.5)
  from commit `2b1a06bedd2ffd64b4d6a5bf6e20b8c4944fc7a3`, completing the
  November 23–29 weekly cycle. The repository remains public. No further
  release is due for this local date.
- [CI run 45181721512](https://github.com/infiniwire/chatty-dock/actions/runs/45181721512)
  passed all three platform checks. The corrected startup fixture also passed
  the Windows CI runner, but the exact cause of the preceding retry timeout is
  not proved. [Release run 45182526261](https://github.com/infiniwire/chatty-dock/actions/runs/45182526261)
  passed all three platform builds and packaged tests, the parallel Windows
  silent upgrade and relaunch test, and publication.
- The release is stable and Latest with all eight expected assets. Downloaded
  packages and manifests passed SHA-256 checks; manifest versions are `0.3.5`
  and listed SHA-512 hashes match. Evidence is in
  `artifacts/maintenance/scheduled-20261123T130004Z/release-v0.3.5-verification.json`.
  Authenticated provider behavior remains unverified; existing update access
  still requires GitHub credentials and ad-hoc macOS updates remain manual.

## 2026-11-24 — scheduled maintenance

- Clean checkout `48b7a57933e944924113de1a9a6fe22c784b040f` matched remote
  `main`. Stable `v0.3.5` remains Latest, with no unfinished release. The
  November monthly and November 23–29 weekly cycles were already completed.
  The repository remains public; no release was triggered for this run.
- SEC-001, severity 8/10: the Electron 44.9.0 shipped in the latest release
  falls within the range of upstream advisory
  [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9).
  An attacker with an affected certificate and network interception capability
  could impersonate a server and expose session or page data. The score reflects
  the potentially serious consequences and specific prerequisites; no actual
  interception was reproduced or observed. This is not a 9–10 release trigger.
- Before the fix, full `npm audit` reported the Electron advisory; `--omit=dev`
  did not report it because Electron is classified as a development dependency
  despite being the packaged runtime. Updated Electron to 44.11.5, above the
  upstream patched version 44.9.1. Afterward, the full audit no longer reported
  an Electron advisory; 15 moderate development-tool findings remain separately.
  The fix is in the unreleased backlog. An actual compromised-certificate attack
  was not reproduced, so mitigation of that attack relies on upstream evidence.
- With Node.js 22.23.3, formatting, lint, TypeScript, 59 unit tests, build,
  development startup, startup recovery, and 32 Electron integration scenarios
  passed both before and after the change. The rebuilt Windows package using
  Electron 44.11.5 passed startup recovery and 32 packaged scenarios. An isolated,
  unauthenticated profile loaded the real ChatGPT homepage before and after the
  change. Authenticated login, CAPTCHA, two-factor and real-user black-screen
  behavior remain unverified. [CI run 45400794496](https://github.com/infiniwire/chatty-dock/actions/runs/45400794496)
  passed on Windows, Intel Mac and Apple Silicon Mac. A future release's installer
  upgrade and platform packaging checks remain required.
- Evidence, including before/after audits, logs, screenshots and the isolated
  Windows package, is in `artifacts/maintenance/scheduled-20261124T130228Z/`.
  The Windows host uses British Columbia local time and this run started near
  06:00. The previously recorded Node/ICU timezone-data discrepancy persists;
  it was not used to determine this run's local date or release cycle.

## 2026-11-24 — public update access correction

- UPD-004, severity 9/10: the installed updater requires GitHub credentials
  even though the release repository is public. Automatic updates are broadly
  unavailable to users without such credentials, although manual installation
  is possible. The user's screenshot shows the access-required message.
- The root cause is the authenticated private provider configured in both the
  application and the package. The correction uses the public GitHub provider,
  does not read GitHub credentials, and removes the obsolete credential UI.
  Old clients need one manual installation before anonymous updates can work.
- Two regression cases failed against the prior updater, both without a token
  and with an unrelated environment token; they passed after the change. A
  real unauthenticated public release check and a controlled GitHub-compatible
  provider check passed locally. The full validation and release workflow,
  including isolated real installation and relaunch, remain publication gates.
- A `0.3.6` daily emergency release was prepared for the 9/10 correction,
  with the verified SEC-001 Electron mitigation included. Evidence is stored in
  `artifacts/maintenance/public-update-20261124/`. The already-completed weekly
  and monthly cycles do not trigger additional releases.
- Candidate CI [run 45485696634](https://github.com/infiniwire/chatty-dock/actions/runs/45485696634)
  exposed a test-only failure on both macOS architectures: the new public feed
  unit tests mocked the platform signature check as unavailable, so the existing
  unsigned-build guard stopped the checks. The test now models a Developer ID
  signature. The production signature guard is unchanged. Local tests passed;
  a new cross-platform CI run must pass before a release tag is created.
- Candidate CI [run 45486250581](https://github.com/infiniwire/chatty-dock/actions/runs/45486250581)
  passed on all three architectures at `cc915f79ef0de7e77a3486f6b9bcdef5e394f3de`.
  Tag `v0.3.6` points to that commit. [Release run 45487228525](https://github.com/infiniwire/chatty-dock/actions/runs/45487228525)
  succeeded on its second attempt: Windows and Intel Mac builds and the isolated Windows update
  installation test passed. The first Apple Silicon attempt timed out after an
  Electron integration assertion waiting five seconds for closed-window web
  contents to be released; cleanup then did not exit before the job timeout.
  Evidence: job `138775911915`, `scripts/electron-test.mjs:1606`. The product
  cause is unconfirmed (TEST-002, 0/10 until a product defect is established).
  Retrying that job on the same tag and commit passed both source and packaged
  tests. No product fix is claimed for the intermittent assertion or cleanup.
- Stable [v0.3.6](https://github.com/infiniwire/chatty-dock/releases/tag/v0.3.6)
  is Latest and points to the expected commit. The repository remains public as
  authorized. All five downloaded installers and archives and both update
  manifests matched SHA-256; manifest versions and SHA-512 entries also matched.
  Evidence: `artifacts/maintenance/public-update-20261124/release-v0.3.6-verification.json`.
  Windows installation testing upgraded 0.3.6 to a controlled 0.3.7 release
  without credentials and verified download integrity, restart and profile.
  Existing clients need one manual installation; ad-hoc macOS builds still
  require manual updates. No additional publication is due on 2026-11-24.

## 2026-11-24 — integration test failure handling

- TEST-002, 0/10: the previous Apple Silicon run timed out waiting for window
  web contents to be released, and failure handling did not terminate before
  the 35-minute job timeout. The original assertion's cause remains unknown;
  a same-commit retry passed and no product defect has been established.
- The Electron harness now bounds failure diagnostics and application cleanup,
  terminates only its own isolated Electron process if graceful shutdown hangs,
  records cleanup failure, and uses a final watchdog. The window-release check
  still requires the exact expected count, gives slow runners 15 seconds, and
  logs window and web contents identities on failure. This improves diagnostics;
  it does not claim to fix the original intermittent window assertion.
- Regression: a real isolated Electron run deliberately encounters both a
  hanging diagnostic and hanging graceful close. Before the bounded cleanup it
  did not exit within 30 seconds; afterward it saved failure evidence and exited
  nonzero. A disposable child-process check verifies forced termination.
  Format, lint, TypeScript, 62 unit tests and 31 Electron integration checks
  passed locally. Package and cross-platform release validation remain required.
- The user explicitly requested immediate deployment after tests, superseding the
  normal once-per-day release limit for this manual follow-up.
- Candidate CI [run 45495825287](https://github.com/infiniwire/chatty-dock/actions/runs/45495825287)
  passed on all three architectures at `5a21c3b5affb22b9b1f41d45a0ed5b7d526b065d`.
  The `v0.3.7` tag points to that commit. [Release run 45496853009](https://github.com/infiniwire/chatty-dock/actions/runs/45496853009)
  completed successfully after retrying the Apple Silicon job. The first attempt
  stalled inside a packaged integration scenario immediately after the second
  launch check; no assertion failure was reported before the job timeout.
  Windows and Intel Mac builds and the Windows update installation test passed.
- Stable [v0.3.7](https://github.com/infiniwire/chatty-dock/releases/tag/v0.3.7)
  points to the expected commit and is Latest. Its five downloaded packages and
  two manifests passed SHA-256 checks; manifest versions and SHA-512 entries
  also matched. Evidence is in `artifacts/maintenance/public-update-20261124/release-v0.3.7-verification.json`.
  The first attempt exposed a different hang before failure handling began, so
  the same requested fix now adds a 90-second bound around each integration
  scenario. An injected never-returning scenario failed and exited with evidence
  after the change; full local source regression passed, as did the targeted
  packaged regression against the previously built 0.3.7 application. The
  original reason for the intermittent Electron call remains unconfirmed.
  Version 0.3.8 deploys this follow-up.
- The freshly built 0.3.8 Windows executable could not be launched locally:
  Windows Device Guard explicitly blocked it. Three attempts failed before the
  application began; this is a local environment restriction (0/10), not a
  confirmed product defect. Do not disable or bypass the policy. The existing
  release workflow ran and passed the packaged Windows tests on its isolated runner.
- Candidate CI [run 45504284128](https://github.com/infiniwire/chatty-dock/actions/runs/45504284128)
  passed for all platforms, and [release run 45505208431](https://github.com/infiniwire/chatty-dock/actions/runs/45505208431)
  passed all platform builds, packaged checks and the Windows installation
  upgrade test. Stable [v0.3.8](https://github.com/infiniwire/chatty-dock/releases/tag/v0.3.8)
  is Latest and points to the expected commit. All five downloaded packages
  and both update manifests matched SHA-256, and manifest versions and SHA-512
  entries matched. Evidence: `artifacts/maintenance/public-update-20261124/release-v0.3.8-verification.json`.

## 2026-11-24 — issue 1 feature evaluation

- [Issue 1](https://github.com/infiniwire/chatty-dock/issues/1) requests editing
  context menus, the Windows emoji picker, and session-only media approvals.
  The proposed implementation is present locally and is not yet released.
- Real Electron fixture checks exercise the context menu, its edit and link
  actions, blocked links, copied image addresses, and the Windows emoji API
  boundary. Fake media devices and an isolated profile verify microphone and
  camera approvals, per-profile isolation, denial and reset after restart.
  These checks do not exercise real devices, authenticated ChatGPT voice, or
  a human interacting with the native emoji panel. Operating-system permissions
  still apply. The documented security policy denies other permission types.
- On Windows, format, lint, TypeScript, 64 unit tests, source and packaged
  builds, startup recovery and 34 real Electron integration checks passed.
  The packaged tests use the same temporary fixture profile and fake devices.
- This is a feature request, not a scored product bug. Preserve these changes
  in the unreleased backlog until validated and incorporated into a release.
- Follow-up Windows validation passed formatting, lint, TypeScript, 66 unit
  tests, and 34 source and 34 packaged Electron scenarios. The local suite
  isolates the system clipboard and explicitly skips real image clipboard
  paste; pull request CI exercises it on disposable runners. Tests include
  real undo and redo in the embedded page and the permissions fixture.
- The source and packaged applications loaded the unauthenticated live ChatGPT
  page in fresh temporary profiles, and a right-click on its composer exposed
  the editing menu. Screenshots and status are saved as
  `artifacts/website-check-{source,packaged}.{png,json}`. A packaged anonymous
  public update check reported the current release and a fixture reached its
  download stage. These checks do not establish authenticated voice or a
  completed production update installation. Pull request CI additionally
  exercises unpacked applications on Windows and both Mac architectures.

## Issue and backlog register

| ID        | Score        | Status                                      | Fix commit            | Verification                                                               |
| --------- | ------------ | ------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| START-001 | 5/10         | Mitigation released in v0.3.4               | `cef0d0f`             | Fixture failed before and passed after; original report needs confirmation |
| AUTH-001  | Not rescored | Previously documented; real sign-in pending | See `known-issues.md` | Fresh manual provider login not verified                                   |
| TEST-001  | 0/10         | Test harness correction released in v0.3.5  | `4a9c2d7`, `2b1a06b`  | Prior CI failure; source, packaged and three-platform CI checks passed     |
| SEC-001   | 8/10         | Mitigation released in v0.3.6               | `82f8a67`             | Advisory removed from audit; app, packaged and three-platform CI passed    |
| UPD-004   | 9/10         | Correction released in v0.3.6               | `434aa4a`             | Anonymous provider and Windows installation upgrade passed                 |
| TEST-002  | 0/10         | Hang safeguards released; cause unconfirmed | `5a21c3b`, `fbd42ca`  | Failure paths reproduced and bounded; original window assertion unresolved |

Future newly confirmed product issues must record reproduction and evidence,
impact and score rationale, root cause, fix, and failing-before/passing-after
verification. Record test or environment failures separately from product bugs.
