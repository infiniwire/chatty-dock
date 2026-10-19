import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { settingsSchema, type Settings } from '../shared/model';

export class Store {
  settings!: Settings;
  recovered = false;
  private timer?: ReturnType<typeof setTimeout>;
  private chain: Promise<void> = Promise.resolve();
  constructor(
    readonly directory: string,
    private readonly downloads: string,
  ) {}
  async load(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    try {
      const raw: unknown = JSON.parse(
        await readFile(path.join(this.directory, 'settings.json'), 'utf8'),
      );
      this.settings = settingsSchema.parse(raw);
      if (!path.isAbsolute(this.settings.downloadDirectory))
        throw new Error('Invalid download directory.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.recovered = true;
        await rename(
          path.join(this.directory, 'settings.json'),
          path.join(this.directory, `settings-recovered-${Date.now()}.json`),
        ).catch(() => {});
      }
      const id = randomUUID();
      this.settings = {
        version: 1,
        profiles: [{ id, name: 'Personal' }],
        defaultProfileId: id,
        downloadDirectory: this.downloads,
        askDownload: true,
        theme: 'system',
        maximized: false,
        lastLocations: {},
        zoom: 1,
      };
    }
    await this.flush();
  }
  changed(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {
        this.recovered = true;
      });
    }, 250);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    const data = JSON.stringify(settingsSchema.parse(this.settings), null, 2);
    const operation = this.chain
      .catch(() => {})
      .then(async () => {
        const target = path.join(this.directory, 'settings.json');
        const temp = `${target}.${randomUUID()}.tmp`;
        await writeFile(temp, data, { mode: 0o600 });
        await rename(temp, target);
      });
    this.chain = operation;
    await operation;
  }
}
