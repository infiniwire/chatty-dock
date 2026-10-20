# Releases

## Default uncredentialed release

No signing secrets are required. A version tag triggers three native jobs:

| Runner         | Architecture | Output      |
| -------------- | ------------ | ----------- |
| windows-2022   | x64          | NSIS EXE    |
| macos-15-intel | x64          | DMG and ZIP |
| macos-15       | arm64        | DMG and ZIP |

Every job runs validation, packages, and tests the packaged executable. Windows additionally tests a real silent installation and automatic relaunch between two isolated test versions. A final publication job checks all five packages, generates merged Windows/Mac update manifests and SHA256SUMS.txt, uploads all assets to a draft, then publishes it. Matrix jobs never publish independently. Missing builds prevent publication.

Windows output is unsigned. macOS output is ad-hoc signed and not notarized. Neither is described as trusted signed distribution. Gatekeeper or Windows reputation prompts may prevent a seamless installation. Users should only install artifacts they trust; this project does not disable OS security settings.

## Trigger a release

After changing `package.json` and the lockfile together, run checks and commit:

```sh
npm version 0.2.2 --no-git-tag-version
npm run verify
git add .
git commit -m "Release 0.2.2"
git push origin main
git tag v0.2.2
git push origin v0.2.2
```

The version tag must match `package.json`. Tags such as `v0.2.2-beta.1` produce prereleases; stable tags produce stable releases. Tags are created by the maintainer, never automatically on every commit.

Manual `workflow_dispatch` builds and collects artifacts without publishing, even if dispatched against a tag. Use it to verify packaging before tagging a public release. Artifacts remain subject to repository access and retention. The repository can remain private throughout.

## Signed builds

For signed tagged releases, set repository variable `SIGNED_RELEASES=true`. Manual dispatch also exposes a signed-build checkbox. Missing credentials or signing failures fail the requested signed build; there is no silent downgrade.

For independent platform signing, use `SIGNED_MAC_RELEASES=true` or `SIGNED_WINDOWS_RELEASES=true`. For example, Mac automatic installation can be enabled with only Apple credentials while Windows remains unsigned. `SIGNED_RELEASES=true` and the manual signed-build checkbox request signing on both platforms.

Repository secrets:

| Secret                      | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| WIN_CSC_LINK                | Base64-encoded Windows signing certificate supported by electron-builder |
| WIN_CSC_KEY_PASSWORD        | Windows certificate password                                             |
| MAC_CSC_LINK                | Base64-encoded Developer ID Application P12 certificate                  |
| MAC_CSC_KEY_PASSWORD        | Mac certificate password                                                 |
| APPLE_ID                    | Apple developer account email                                            |
| APPLE_APP_SPECIFIC_PASSWORD | Apple app-specific notarization password                                 |
| APPLE_TEAM_ID               | Apple Developer team ID                                                  |

For local signed packaging, set `DOCK_SIGNED=1`; map the platform certificate secrets to `CSC_LINK` and `CSC_KEY_PASSWORD`, and provide the Apple variables on macOS. Modern Windows certificates may require hardware or cloud signing rather than an exportable file; adapt the signing configuration for your certificate provider before enabling signed distribution.

electron-builder 26 handles platform signing and macOS notarization/stapling when enabled. Signed mode uses hardened runtime and explicit entitlements. Do not invent credentials or commit certificate files. Use the installed v26 documentation when changing configuration, rather than unreleased v27 options.

## Permissions and reruns

The workflow uses the repository's automatic `GITHUB_TOKEN`, derives repository identity from the workflow context, and grants `contents: write` only to the final publication job. No personal access token is required.

Concurrency serializes runs for the same ref. Reruns validate every package before replacing same-named release assets. Existing releases are temporarily made drafts while the complete asset set is replaced; successful final publication restores release visibility. Never move an existing published version tag to different source code.

## Troubleshooting

- Version mismatch: update package version and lockfile or use the matching tag.
- Wrong architecture: check the explicit runner architecture assertion.
- Missing signing credentials: supply the documented secrets or select uncredentialed mode deliberately.
- Failed notarization: inspect Apple's response and certificate entitlements; do not silently disable notarization.
- Failed packaged smoke test: inspect uploaded fixture screenshots and JSON evidence.
- Missing packages: inspect all matrix jobs; the final job will not publish incomplete output.
- No workflow run: check repository Actions settings, permissions, and account runner availability.

An installer build proves packaging, not real ChatGPT authentication. Keep the manual website checklist separate from CI results.
