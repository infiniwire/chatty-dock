import { app, safeStorage } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import electronUpdater from 'electron-updater';
import { UpdateController, type UpdateBackend } from './update-controller';
import type { UpdateState } from '../shared/model';

const run = promisify(execFile);
export class Updates {
  private controller?: UpdateController;
  private fallback: UpdateState = {
    stage: 'idle',
    message: 'Updates are checked automatically at startup.',
  };
  private initializing?: Promise<void>;
  constructor(
    private changed: () => void,
    private canInstall: () => boolean,
    private prepareInstall: () => Promise<void>,
    private testMode: boolean,
    private e2eFeed?: string,
  ) {}
  get state(): UpdateState {
    return this.controller?.state ?? this.fallback;
  }
  private set(state: UpdateState): void {
    this.fallback = state;
    this.changed();
  }
  private get tokenPath(): string {
    return path.join(app.getPath('userData'), 'update-token.enc');
  }
  async saveToken(token: string): Promise<void> {
    if (
      this.state.stage === 'downloading' ||
      this.state.stage === 'waiting' ||
      this.state.stage === 'installing'
    )
      throw new Error('Wait for the current update to finish before changing credentials.');
    if (token) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error(
          'Operating system credential encryption is unavailable. Use a local GH_TOKEN environment variable instead.',
        );
      const encrypted = await safeStorage.encryptStringAsync(token);
      await writeFile(`${this.tokenPath}.tmp`, encrypted, { mode: 0o600 });
      await rename(`${this.tokenPath}.tmp`, this.tokenPath);
    } else
      await unlink(this.tokenPath).catch((error) => {
        if (error.code !== 'ENOENT') throw new Error('The saved credential could not be removed.');
      });
    // Reuse the existing updater and its listeners; refresh only the feed credentials.
    await this.check(true);
  }
  private async credentials(): Promise<
    { token: string; source: 'saved' | 'environment' | 'github-cli' } | undefined
  > {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = await readFile(this.tokenPath);
        const result = await safeStorage.decryptStringAsync(encrypted);
        if (result.result) return { token: result.result, source: 'saved' };
      }
    } catch {
      /* An unavailable keychain does not prevent environment or CLI credentials. */
    }
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (token) return { token, source: 'environment' };
    try {
      const result = await run('gh', ['auth', 'token', '--hostname', 'github.com'], {
        timeout: 5000,
        maxBuffer: 8192,
        windowsHide: true,
      });
      if (result.stdout.trim()) return { token: result.stdout.trim(), source: 'github-cli' };
    } catch {
      /* GitHub CLI is optional on client machines. */
    }
    return;
  }
  async check(refresh = false): Promise<void> {
    if (this.initializing) return this.initializing;
    this.initializing = this.start(refresh).finally(() => {
      this.initializing = undefined;
    });
    return this.initializing;
  }
  private async start(refresh: boolean): Promise<void> {
    if ((!app.isPackaged || this.testMode) && !this.e2eFeed) {
      this.set({
        stage: 'development',
        message: 'Automatic installation runs in the installed application.',
      });
      return;
    }
    if (process.platform === 'darwin') {
      try {
        await run(
          '/usr/bin/codesign',
          ['--verify', '--deep', '--strict', app.getPath('exe').split('/Contents/')[0]],
          { timeout: 15000 },
        );
        const signature = await run(
          '/usr/bin/codesign',
          ['-dv', app.getPath('exe').split('/Contents/')[0]],
          { timeout: 10000 },
        );
        if (!signature.stderr.includes('Authority=Developer ID Application:'))
          throw new Error('Developer ID required');
      } catch {
        this.set({
          stage: 'unsupported',
          message:
            'Automatic installation on macOS requires a Developer ID signed build. This ad-hoc build must be updated manually.',
        });
        return;
      }
    }
    const backend = electronUpdater.autoUpdater;
    if (!this.controller)
      this.controller = new UpdateController(
        backend as unknown as UpdateBackend,
        this.changed,
        this.canInstall,
        this.prepareInstall,
      );
    if (this.e2eFeed) {
      const url = new URL(this.e2eFeed);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
        throw new Error('Invalid updater fixture.');
      backend.setFeedURL({ provider: 'generic', url: url.href });
    } else if (
      refresh ||
      this.controller.state.stage === 'idle' ||
      this.controller.state.stage === 'credentials' ||
      this.controller.state.stage === 'error'
    ) {
      const credentials = await this.credentials();
      if (!credentials) {
        this.controller.set({
          stage: 'credentials',
          message:
            'Private repository access is needed. Sign into GitHub CLI or save a repository-read token in Settings.',
        });
        return;
      }
      backend.setFeedURL({
        provider: 'github',
        owner: 'infiniwire',
        repo: 'chatty-dock',
        private: true,
        token: credentials.token,
      });
      this.controller.set({
        stage: 'idle',
        message: 'Repository access is configured.',
        credentialSource: credentials.source,
      });
    }
    await this.controller.check();
  }
  async maybeInstall(): Promise<void> {
    await this.controller?.maybeInstall();
  }
}
