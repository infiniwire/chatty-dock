import { randomUUID } from 'node:crypto';
import { access, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { shell, type DownloadItem, type Session, type WebContents } from 'electron';
import { z } from 'zod';
import type { DownloadRecord } from '../shared/model';
import type { Store } from './store';
import { safeFilename, uniqueDownloadPath } from './policy';

const recordSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  windowId: z.number(),
  filename: z.string().max(256),
  path: z.string().max(4096),
  received: z.number(),
  total: z.number(),
  state: z.enum(['progressing', 'paused', 'interrupted', 'completed', 'cancelled', 'failed']),
  resumable: z.boolean(),
  active: z.boolean(),
  createdAt: z.number(),
});
export class Downloads {
  records: DownloadRecord[] = [];
  private items = new Map<string, DownloadItem>();
  private attached = new Set<Session>();
  private persistTimer?: ReturnType<typeof setTimeout>;
  private chain: Promise<void> = Promise.resolve();
  constructor(
    private store: Store,
    private owner: (contents: WebContents) => number,
    private changed: () => void,
  ) {}
  async load(): Promise<void> {
    try {
      this.records = z
        .array(recordSchema)
        .max(300)
        .parse(JSON.parse(await readFile(this.file, 'utf8')))
        .map((record) => ({
          ...record,
          state: record.active ? 'interrupted' : record.state,
          active: false,
          resumable: false,
        }));
    } catch {
      this.records = [];
    }
  }
  private get file(): string {
    return path.join(this.store.directory, 'downloads.json');
  }
  attach(session: Session, profileId: string): void {
    if (this.attached.has(session)) return;
    this.attached.add(session);
    session.on('will-download', (_event, item, contents) => {
      const id = randomUUID();
      const settings = this.store.settings;
      const filename = safeFilename(item.getFilename());
      if (settings.askDownload) {
        item.setSaveDialogOptions({
          defaultPath: path.join(settings.downloadDirectory, filename),
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
      } else {
        // UUID-qualified names avoid same-name overwrites without blocking the main process on filesystem scans.
        item.setSavePath(uniqueDownloadPath(settings.downloadDirectory, filename, id));
      }
      const record: DownloadRecord = {
        id,
        profileId,
        windowId: contents ? this.owner(contents) : -1,
        filename,
        path: '',
        received: 0,
        total: item.getTotalBytes(),
        state: 'progressing',
        resumable: false,
        active: true,
        createdAt: Date.now(),
      };
      this.records.unshift(record);
      this.items.set(id, item);
      this.trim();
      const update = (): void => {
        record.path = item.getSavePath();
        record.received = item.getReceivedBytes();
        record.total = item.getTotalBytes();
        record.resumable = item.canResume();
        record.state = item.isPaused()
          ? 'paused'
          : item.getState() === 'interrupted'
            ? 'interrupted'
            : 'progressing';
        this.changed();
      };
      item.on('updated', update);
      item.once('done', (_event, state) => {
        record.path = item.getSavePath();
        record.received = item.getReceivedBytes();
        record.state = state;
        record.active = false;
        record.resumable = false;
        this.items.delete(id);
        this.trim();
        this.changed();
        this.persist();
      });
      this.changed();
      this.persist();
    });
  }
  private trim(): void {
    const active = this.records.filter((r) => r.active);
    this.records = [...active, ...this.records.filter((r) => !r.active).slice(0, 200)].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }
  hasActive(profileId?: string, windowId?: number): boolean {
    return this.records.some(
      (r) =>
        r.active &&
        (!profileId || r.profileId === profileId) &&
        (windowId === undefined || r.windowId === windowId),
    );
  }
  async action(id: string, action: string): Promise<void> {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error('Download no longer exists.');
    const item = this.items.get(id);
    if (action === 'cancel' && item) item.cancel();
    else if (action === 'pause' && item && record.state === 'progressing') item.pause();
    else if (action === 'resume' && item && (item.isPaused() || item.canResume())) item.resume();
    else if (
      (action === 'open' || action === 'reveal') &&
      record.state === 'completed' &&
      path.isAbsolute(record.path)
    ) {
      await access(record.path);
      if (action === 'open') {
        const error = await shell.openPath(record.path);
        if (error) throw new Error('The file could not be opened.');
      } else shell.showItemInFolder(record.path);
    } else throw new Error('This action is not available for the download.');
    this.changed();
  }
  clear(): void {
    this.records = this.records.filter((r) => r.active);
    this.persist();
    this.changed();
  }
  cancelAll(): void {
    for (const item of this.items.values()) item.cancel();
  }
  private persist(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, 250);
  }
  async flush(): Promise<void> {
    clearTimeout(this.persistTimer);
    const data = JSON.stringify(this.records.filter((r) => !r.active).slice(0, 200), null, 2);
    this.chain = this.chain
      .catch(() => {})
      .then(async () => {
        const tmp = `${this.file}.tmp`;
        await writeFile(tmp, data, { mode: 0o600 });
        await rename(tmp, this.file);
      });
    await this.chain;
  }
}
