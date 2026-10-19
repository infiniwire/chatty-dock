import type { UpdateState } from '../shared/model';

type ReleaseDetails = {
  version?: string;
  releaseDate?: string;
  releaseNotes?: string | Array<{ version?: string; note?: string }> | null;
};

// Release descriptions are untrusted text. Bound their size and discard HTML;
// the renderer displays the result as text, never as executable markup.
function releaseDetails(
  info: ReleaseDetails = {},
): Pick<UpdateState, 'version' | 'releaseDate' | 'releaseNotes'> {
  const details: Pick<UpdateState, 'version' | 'releaseDate' | 'releaseNotes'> = {};
  if (
    typeof info.version === 'string' &&
    info.version.length <= 64 &&
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(info.version)
  )
    details.version = info.version;
  if (
    typeof info.releaseDate === 'string' &&
    info.releaseDate.length <= 80 &&
    Number.isFinite(Date.parse(info.releaseDate))
  )
    details.releaseDate = new Date(info.releaseDate).toISOString();
  const raw =
    typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes
            .slice(0, 6)
            .filter((item) => item && typeof item.note === 'string')
            .map(
              (item) =>
                `${typeof item.version === 'string' ? item.version.slice(0, 64) + '\n' : ''}${item.note!.slice(0, 8000)}`,
            )
            .join('\n\n')
        : '';
  const notes = raw
    .slice(0, 16000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|apos);/g,
      (entity) =>
        ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[
          entity
        ] ?? entity,
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000);
  if (notes) details.releaseNotes = notes;
  return details;
}

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
    backend.on('update-not-available', (info: ReleaseDetails = {}) =>
      this.set({
        ...releaseDetails(info),
        stage: 'current',
        message: 'You are running the latest release.',
        checkedAt: Date.now(),
      }),
    );
    backend.on('update-available', (info: ReleaseDetails) =>
      this.set({
        ...releaseDetails(info),
        stage: 'downloading',
        message: 'Downloading update in the background…',
        checkedAt: Date.now(),
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
    backend.on('update-downloaded', (info: ReleaseDetails) => {
      this.downloaded = true;
      this.set({
        ...this.state,
        ...releaseDetails(info),
        stage: 'waiting',
        message: 'Update verified. Waiting for file downloads before restarting…',
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
      checkedAt: state.checkedAt ?? this.state.checkedAt,
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
