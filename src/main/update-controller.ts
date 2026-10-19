import type { UpdateState } from '../shared/model';

export interface UpdateBackend {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  autoRunAppAfterInstall: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  disableDifferentialDownload: boolean;
  disableWebInstaller: boolean;
  logger: null;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(silent?: boolean, forceRunAfter?: boolean): void;
}

/** Coordinates verified downloads and a single, flushed, silent installation. */
export class UpdateController {
  state: UpdateState = { stage: 'idle', message: 'Updates are checked automatically at startup.' };
  private checking = false;
  private downloaded = false;
  private installing = false;
  constructor(
    private backend: UpdateBackend,
    private changed: () => void,
    private canInstall: () => boolean,
    private prepareInstall: () => Promise<void>,
  ) {
    backend.autoDownload = true;
    backend.autoInstallOnAppQuit = false;
    backend.autoRunAppAfterInstall = true;
    backend.allowPrerelease = false;
    backend.allowDowngrade = false;
    // Full downloads are reliable with authenticated private GitHub asset redirects.
    backend.disableDifferentialDownload = true;
    backend.disableWebInstaller = true;
    backend.logger = null;
    backend.on('checking-for-update', () =>
      this.set({ stage: 'checking', message: 'Checking GitHub Releases…' }),
    );
    backend.on('update-not-available', () =>
      this.set({ stage: 'current', message: 'You are running the latest release.' }),
    );
    backend.on('update-available', (info: { version: string }) =>
      this.set({
        stage: 'downloading',
        message: 'Downloading update in the background…',
        version: info.version,
        percent: 0,
      }),
    );
    backend.on('download-progress', (info: { percent: number }) =>
      this.set({
        ...this.state,
        stage: 'downloading',
        percent: Math.max(0, Math.min(100, info.percent)),
      }),
    );
    backend.on('update-downloaded', (info: { version: string }) => {
      this.downloaded = true;
      this.set({
        stage: 'waiting',
        message: 'Update verified. Waiting for file downloads before restarting…',
        version: info.version,
        percent: 100,
      });
      void this.maybeInstall();
    });
    backend.on('error', () => this.fail());
  }
  set(state: UpdateState): void {
    this.state = {
      ...state,
      credentialSource: state.credentialSource ?? this.state.credentialSource,
    };
    this.changed();
  }
  fail(): void {
    this.downloaded = false;
    this.installing = false;
    // Provider errors can contain tokens, authorization headers, or signed URLs.
    this.set({
      stage: 'error',
      message:
        'Update failed. Check your connection and repository access, then retry. The current installation has been kept.',
    });
  }
  async check(): Promise<void> {
    if (this.checking || this.installing || this.downloaded || this.state.stage === 'downloading')
      return;
    this.checking = true;
    try {
      await this.backend.checkForUpdates();
    } catch {
      this.fail();
    } finally {
      this.checking = false;
    }
  }
  async maybeInstall(): Promise<void> {
    if (!this.downloaded || this.installing || !this.canInstall()) return;
    this.installing = true;
    this.set({ ...this.state, stage: 'installing', message: 'Installing update and restarting…' });
    try {
      await this.prepareInstall();
      this.backend.quitAndInstall(true, true);
    } catch {
      this.fail();
    }
  }
}
