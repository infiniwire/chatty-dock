import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, it } from 'vitest';
import { Store } from '../src/main/store';

it('persists valid settings with serialized atomic writes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dock-store-'));
  try {
    const store = new Store(directory, os.tmpdir());
    await store.load();
    const id = store.settings.profiles[0].id;
    store.settings.profiles[0].name = 'Work';
    await Promise.all([store.flush(), store.flush()]);
    const restored = new Store(directory, os.tmpdir());
    await restored.load();
    expect(restored.settings.profiles[0]).toEqual({ id, name: 'Work' });
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
it('recovers corrupted settings without touching browser data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dock-store-'));
  try {
    await writeFile(path.join(directory, 'settings.json'), '{bad');
    await writeFile(path.join(directory, 'browser-sentinel'), 'keep');
    const store = new Store(directory, os.tmpdir());
    await store.load();
    expect(store.recovered).toBe(true);
    expect(store.settings.profiles).toHaveLength(1);
    expect(await readFile(path.join(directory, 'browser-sentinel'), 'utf8')).toBe('keep');
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
