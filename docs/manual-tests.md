# Manual verification

This checklist requires an interactive user and, for website checks, a ChatGPT account. Unchecked entries are unverified. CI's loopback fixtures do not count as passes here.

Record operating system, architecture, app version, and installation/signing mode for each run. Do not include private conversation contents or credentials in evidence.

## Installation and lifecycle

- [ ] Install the Windows NSIS package as a normal user.
- [ ] Install the Intel macOS DMG on Intel hardware.
- [ ] Install the Apple Silicon DMG on Apple Silicon hardware.
- [ ] Confirm normal startup, menus, shortcuts, and display scaling.
- [ ] Confirm relaunch opens a second window, not a duplicate application coordinator.
- [ ] Close one window while another remains usable.
- [ ] On macOS close the last window, reactivate from the Dock, and confirm a new window opens.
- [ ] Install a newer version and confirm profiles/settings survive.

## Website and accounts

- [ ] Load https://chatgpt.com without changing certificate validation or User-Agent.
- [ ] Sign in using the account's supported method, including any required popup.
- [ ] Open another window with the current profile and confirm login reuse.
- [ ] Open a different persistent profile and sign into another account.
- [ ] Restart the app and confirm both profiles retain valid sessions.
- [ ] Rename a profile without losing its session.
- [ ] Sign out of a shared profile and check the effect on its other windows.
- [ ] Confirm independent profiles remain isolated.
- [ ] Check external links and any restricted authentication-provider explanation.
- [ ] Click Twitter/X and other external links, including new-window links, and confirm the system default browser opens while ChatGPT remains in the container.

## Attachments and downloads

- [ ] Select a file using ChatGPT's real attachment picker.
- [ ] Select multiple supported files.
- [ ] Drag files from Finder/Explorer into the website.
- [ ] Paste a real clipboard image.
- [ ] Confirm upload completion and appropriate website errors for unsupported files.
- [ ] Download a generated file and verify its contents.
- [ ] Download two same-name files without silent overwrite.
- [ ] Test save-as dialog, selected folder, progress, cancel, and supported pause/resume.
- [ ] Close a downloading window and confirm the transfer continues.
- [ ] Quit with active downloads and confirm the cancellation prompt.
- [ ] Confirm completed files open/reveal only on request.

## Long conversations and recovery

- [ ] Open a representative real long conversation and record input/scroll behavior.
- [ ] Repeat with multiple windows and compare on-demand process diagnostics.
- [ ] Close extra windows and confirm resources settle without accumulating remote views.
- [ ] Test large code blocks, formulas, images, selection/copy, and streaming output.
- [ ] Disconnect networking and verify useful retry behavior.
- [ ] If voice is needed, check application and operating-system permission prompts.

Do not claim long-conversation improvements without comparable measured evidence. Do not label restricted login providers as supported merely because their pages load.
