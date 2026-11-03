import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { Downloads } from '../src/main/downloads';
import { Store } from '../src/main/store';

vi.mock('electron', () => ({ shell: {} }));

it('restores unfinished download history as interrupted without offering stale transfer actions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dock-download-history-'));
  try {
    const store = new Store(directory, os.tmpdir());
    await store.load();
    const downloads = new Downloads(
      store,
      () => 1,
      () => {},
    );
    const pending = {
      id: randomUUID(),
      profileId: store.settings.defaultProfileId,
      windowId: 1,
      filename: 'unfinished.txt',
      path: path.join(directory, 'unfinished.txt'),
      received: 1024,
      total: 4096,
      state: 'paused' as const,
      resumable: true,
      active: true,
      createdAt: Date.now(),
    };
    const completed = {
      ...pending,
      id: randomUUID(),
      filename: 'saved.txt',
      path: path.join(directory, 'saved.txt'),
      state: 'completed' as const,
      received: 4096,
      active: false,
      resumable: false,
    };
    downloads.records = [pending, completed];
    await downloads.flush();

    const restored = new Downloads(
      store,
      () => 1,
      () => {},
    );
    await restored.load();
    expect(restored.records).toEqual([
      { ...pending, state: 'interrupted', active: false, resumable: false },
      completed,
    ]);
    expect(restored.hasActive()).toBe(false);
    await expect(restored.action(pending.id, 'resume')).rejects.toThrow(
      'This action is not available',
    );
    restored.clear();
    await restored.flush();
    const cleared = new Downloads(
      store,
      () => 1,
      () => {},
    );
    await cleared.load();
    expect(cleared.records).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
