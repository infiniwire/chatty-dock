import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { UpdateController, type UpdateBackend } from '../src/main/update-controller';

function setup() {
  const backend = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: true,
    autoRunAppAfterInstall: false,
    allowPrerelease: true,
    allowDowngrade: true,
    disableDifferentialDownload: false,
    disableWebInstaller: false,
    logger: null,
  });
  const prepare = vi.fn(async () => {});
  const canInstall = vi.fn(() => true);
  // Production commits its quitting flag here, after the final canInstall check.
  const beginInstall = vi.fn(() => canInstall.mockReturnValue(false));
  const controller = new UpdateController(
    backend as unknown as UpdateBackend,
    vi.fn(),
    canInstall,
    prepare,
    beginInstall,
  );
  return { backend, controller, prepare, canInstall, beginInstall };
}
describe('automatic update lifecycle', () => {
  it('waits again if a file transfer starts while session data is being flushed', async () => {
    const { backend, controller, prepare, canInstall, beginInstall } = setup();
    let finish!: () => void;
    prepare.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    canInstall.mockReturnValue(false);
    backend.emit('update-downloaded', { version: '0.3.0' });
    canInstall.mockReturnValue(true);
    const pending = controller.maybeInstall();
    canInstall.mockReturnValue(false);
    finish();
    await pending;
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
    expect(controller.state.stage).toBe('waiting');
    expect(beginInstall).not.toHaveBeenCalled();
    canInstall.mockReturnValue(true);
    await controller.maybeInstall();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(backend.quitAndInstall).toHaveBeenCalledOnce();
    expect(beginInstall).toHaveBeenCalledOnce();
  });
  it('does not install after an updater error invalidates an in-flight session flush', async () => {
    const { backend, controller, prepare, canInstall, beginInstall } = setup();
    let finish!: () => void;
    prepare.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    canInstall.mockReturnValue(false);
    backend.emit('update-downloaded', { version: '0.3.0' });
    canInstall.mockReturnValue(true);
    const pending = controller.maybeInstall();
    backend.emit('error', new Error('failed while flushing'));
    finish();
    await pending;
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
    expect(controller.state.stage).toBe('error');
    expect(beginInstall).not.toHaveBeenCalled();
  });
  it.each(['resolve', 'reject'] as const)(
    'ignores a stale %s from an older install attempt after retry starts',
    async (outcome) => {
      const { backend, controller, prepare, canInstall, beginInstall } = setup();
      let finishOld!: () => void;
      let rejectOld!: (error: Error) => void;
      let finishNew!: () => void;
      prepare
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve, reject) => {
              finishOld = resolve;
              rejectOld = reject;
            }),
        )
        .mockImplementationOnce(() => new Promise<void>((resolve) => (finishNew = resolve)));
      canInstall.mockReturnValue(false);
      backend.emit('update-downloaded', { version: '0.3.0' });
      canInstall.mockReturnValue(true);
      const oldAttempt = controller.maybeInstall();
      backend.emit('error', new Error('retry required'));
      canInstall.mockReturnValue(false);
      backend.emit('update-downloaded', { version: '0.3.1' });
      canInstall.mockReturnValue(true);
      const newAttempt = controller.maybeInstall();
      if (outcome === 'resolve') finishOld();
      else rejectOld(new Error('old flush failed'));
      await oldAttempt;
      expect(backend.quitAndInstall).not.toHaveBeenCalled();
      expect(controller.state.stage).toBe('installing');
      expect(controller.state.version).toBe('0.3.1');
      expect(beginInstall).not.toHaveBeenCalled();
      finishNew();
      await newAttempt;
      expect(backend.quitAndInstall).toHaveBeenCalledOnce();
      expect(beginInstall).toHaveBeenCalledOnce();
    },
  );
  it('clears stale access status when credentials are removed without a fallback', () => {
    const { backend, controller } = setup();
    controller.set({ stage: 'idle', message: 'Configured.', credentialSource: 'saved' });
    backend.emit('checking-for-update');
    expect(controller.state.credentialSource).toBe('saved');
    controller.set({ stage: 'credentials', message: 'Repository access is needed.' });
    expect(controller.state.credentialSource).toBeUndefined();
  });
  it('keeps bounded plain-text release notes and check time through download and waiting', () => {
    const { backend, controller, canInstall } = setup();
    canInstall.mockReturnValue(false);
    backend.emit('update-available', {
      version: '0.3.0',
      releaseDate: '2026-10-19T08:00:00Z',
      releaseNotes: [
        {
          version: '0.3.0',
          note: '<p>Better &amp; safer.</p><script>doNotRun()</script>' + 'x'.repeat(6000),
        },
      ],
    });
    const notes = controller.state.releaseNotes;
    const checkedAt = controller.state.checkedAt;
    expect(controller.state.version).toBe('0.3.0');
    expect(controller.state.releaseDate).toBe('2026-10-19T08:00:00.000Z');
    expect(checkedAt).toBeGreaterThan(0);
    expect(notes).toContain('Better & safer.');
    expect(notes).not.toMatch(/<script|doNotRun|<p>/);
    expect(notes!.length).toBeLessThanOrEqual(4000);
    backend.emit('download-progress', { percent: 42 });
    backend.emit('update-downloaded', { version: '0.3.0' });
    expect(controller.state.stage).toBe('waiting');
    expect(controller.state.releaseNotes).toBe(notes);
    expect(controller.state.checkedAt).toBe(checkedAt);
  });
  it('records successful checks but does not label a failed check as current', () => {
    const { backend, controller } = setup();
    backend.emit('update-not-available', {
      version: '0.2.0',
      releaseDate: 'invalid',
      releaseNotes: null,
    });
    expect(controller.state.stage).toBe('current');
    expect(controller.state.version).toBe('0.2.0');
    expect(controller.state.releaseDate).toBeUndefined();
    const checkedAt = controller.state.checkedAt;
    backend.emit('checking-for-update');
    backend.emit('error', new Error('secret-token'));
    expect(controller.state.stage).toBe('error');
    expect(controller.state.checkedAt).toBe(checkedAt);
    expect(controller.state.version).toBeUndefined();
    expect(JSON.stringify(controller.state)).not.toContain('secret-token');
  });
  it('downloads stable updates, flushes state, installs silently and forces relaunch', async () => {
    const { backend, controller, prepare } = setup();
    expect(backend.autoDownload).toBe(true);
    expect(backend.allowDowngrade).toBe(false);
    expect(backend.allowPrerelease).toBe(false);
    expect(backend.autoInstallOnAppQuit).toBe(false);
    backend.emit('update-available', { version: '0.1.2' });
    backend.emit('download-progress', { percent: 42 });
    expect(controller.state.percent).toBe(42);
    backend.emit('update-downloaded', { version: '0.1.2' });
    await vi.waitFor(() => expect(backend.quitAndInstall).toHaveBeenCalledWith(true, true));
    expect(prepare).toHaveBeenCalledOnce();
    expect(controller.state.stage).toBe('installing');
    await controller.maybeInstall();
    expect(backend.quitAndInstall).toHaveBeenCalledOnce();
  });
  it('waits for active transfers and never installs before the verified-download event', async () => {
    const { backend, controller, canInstall } = setup();
    await controller.maybeInstall();
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
    canInstall.mockReturnValue(false);
    backend.emit('update-downloaded', { version: '0.1.2' });
    await controller.maybeInstall();
    expect(controller.state.stage).toBe('waiting');
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
    canInstall.mockReturnValue(true);
    await controller.maybeInstall();
    expect(backend.quitAndInstall).toHaveBeenCalledOnce();
  });
  it('deduplicates overlapping checks', async () => {
    const { backend, controller } = setup();
    let finish!: () => void;
    backend.checkForUpdates.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const first = controller.check();
    await controller.check();
    expect(backend.checkForUpdates).toHaveBeenCalledOnce();
    finish();
    await first;
  });
  it('redacts provider errors and does not install corrupt or unavailable downloads', async () => {
    const { backend, controller } = setup();
    backend.emit(
      'error',
      new Error('Authorization: token SECRET https://private/signed?secret=SECRET'),
    );
    expect(JSON.stringify(controller.state)).not.toContain('SECRET');
    await controller.maybeInstall();
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
  });
  it('keeps the current installation when saving session state fails', async () => {
    const { backend, controller, prepare } = setup();
    prepare.mockRejectedValueOnce(new Error('disk unavailable'));
    backend.emit('update-downloaded', { version: '0.1.2' });
    await vi.waitFor(() => expect(controller.state.stage).toBe('error'));
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
  });
});
