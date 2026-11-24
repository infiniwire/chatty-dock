import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
  private feedConfigured = false;
  constructor(
    private changed: () => void,
    private canInstall: () => boolean,
    private prepareInstall: () => Promise<void>,
    private beginInstall: () => void,
    private testMode: boolean,
    private e2eFeed?: string,
    private publicFeedTest = false,
  ) {}
  get state(): UpdateState {
    return this.controller?.state ?? this.fallback;
  }
  private set(state: UpdateState): void {
    this.fallback = state;
    this.changed();
  }
  async check(): Promise<void> {
    if (this.initializing) return this.initializing;
    this.initializing = this.start().finally(() => {
      this.initializing = undefined;
    });
    return this.initializing;
  }
  private async start(): Promise<void> {
    if ((!app.isPackaged || this.testMode) && !this.e2eFeed && !this.publicFeedTest) {
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
        this.beginInstall,
      );
    // The isolated public-feed probe performs a real check but cannot download
    // or install an update, even if a newer release appears during the test.
    if (this.publicFeedTest) {
      backend.autoDownload = false;
      if (!app.isPackaged) backend.forceDevUpdateConfig = true;
    }
    if (!this.feedConfigured) {
      if (this.e2eFeed) {
        const url = new URL(this.e2eFeed);
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
          throw new Error('Invalid updater fixture.');
        backend.setFeedURL({
          provider: 'github',
          owner: 'infiniwire',
          repo: 'chatty-dock',
          private: false,
          host: url.host,
          protocol: 'http',
        });
      } else {
        backend.setFeedURL({
          provider: 'github',
          owner: 'infiniwire',
          repo: 'chatty-dock',
          private: false,
        });
      }
      this.feedConfigured = true;
    }
    await this.controller.check();
  }
  async maybeInstall(): Promise<void> {
    await this.controller?.maybeInstall();
  }
}
