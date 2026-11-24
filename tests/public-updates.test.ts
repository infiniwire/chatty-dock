import { afterEach, describe, expect, it, vi } from 'vitest';
import electronUpdater from 'electron-updater';
import { Updates } from '../src/main/updates';

vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => 'unused-test-profile' },
  safeStorage: { isEncryptionAvailable: () => false },
}));
vi.mock('node:child_process', () => ({
  execFile: (_file: string, _args: string[], _options: unknown, callback: (error: Error) => void) =>
    callback(new Error('GitHub CLI unavailable')),
}));
vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    default: {
      autoUpdater: Object.assign(new EventEmitter(), {
        setFeedURL: vi.fn(),
        checkForUpdates: vi.fn(async () => {}),
      }),
    },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  electronUpdater.autoUpdater.removeAllListeners();
});

describe('public update feed', () => {
  it.each(['', 'unrelated-environment-token'])(
    'checks the public release without GitHub credentials (token environment: %s)',
    async (token) => {
      vi.stubEnv('GH_TOKEN', token);
      vi.stubEnv('GITHUB_TOKEN', token);
      const updates = new Updates(vi.fn(), () => false, vi.fn(), vi.fn(), false);
      await updates.check();
      expect(electronUpdater.autoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'github',
        owner: 'infiniwire',
        repo: 'chatty-dock',
        private: false,
      });
      expect(electronUpdater.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
      expect(updates.state.stage).not.toBe('credentials');
    },
  );
  it('uses the public GitHub provider for an isolated update-install fixture', async () => {
    const updates = new Updates(
      vi.fn(),
      () => false,
      vi.fn(),
      vi.fn(),
      true,
      'http://127.0.0.1:18421',
    );
    await updates.check();
    expect(electronUpdater.autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: 'infiniwire',
      repo: 'chatty-dock',
      private: false,
      host: '127.0.0.1:18421',
      protocol: 'http',
    });
    expect(electronUpdater.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });
  it('refuses an updater fixture outside the local test host', async () => {
    const updates = new Updates(vi.fn(), () => false, vi.fn(), vi.fn(), true, 'http://example.com');
    await expect(updates.check()).rejects.toThrow('Invalid updater fixture.');
    expect(electronUpdater.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });
});
