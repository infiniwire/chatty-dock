import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture } from './fixture.mjs';
import { startGitHubUpdateFixture } from './github-update-fixture.mjs';

const fixture = await startFixture();
const localFeed = process.argv.includes('--fixture')
  ? await startGitHubUpdateFixture('99.0.0', 'fixture.exe', Buffer.from('test installer'))
  : undefined;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dock-public-updates-'));
const env = {
  ...process.env,
  DOCK_TEST: '1',
  DOCK_TEST_DATA: directory,
  DOCK_FIXTURE: fixture.origin,
  GH_TOKEN: '',
  GITHUB_TOKEN: '',
};
if (localFeed) env.DOCK_PUBLIC_UPDATE_FIXTURE = localFeed.origin;
else delete env.DOCK_PUBLIC_UPDATE_FIXTURE;
delete env.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await electron.launch({
    ...(process.env.DOCK_EXECUTABLE
      ? {
          executablePath: process.env.DOCK_EXECUTABLE,
          args: ['--dock-test', '--dock-public-update-test'],
        }
      : { args: ['.', '--dock-test', '--dock-public-update-test'] }),
    env,
    timeout: 45000,
  });
  await application.firstWindow();
  let shell;
  await expect
    .poll(
      () => {
        shell = application
          .context()
          .pages()
          .find((page) => page.url().startsWith('dock://ui/'));
        return Boolean(shell);
      },
      { timeout: 45000 },
    )
    .toBe(true);
  await shell.waitForFunction(() => Boolean(window.dock));
  const result = await shell.evaluate(() => window.dock.command({ type: 'updates' }));
  expect(result.ok).toBe(true);
  const snapshot = () =>
    shell.evaluate(
      () =>
        new Promise((resolve) => {
          const off = window.dock.subscribe((state) => {
            off();
            resolve(state);
          });
          void window.dock.command({ type: 'snapshot' });
        }),
    );
  let state;
  let lastStage;
  await expect
    .poll(
      async () => {
        state = (await snapshot()).update;
        if (state.stage !== lastStage) {
          console.log(`Public update probe stage: ${state.stage}: ${state.message}`);
          lastStage = state.stage;
        }
        return ['current', 'downloading', 'error'].includes(state.stage);
      },
      { timeout: 60000 },
    )
    .toBe(true);
  if (state.stage === 'error') throw new Error(`Public update check failed: ${state.message}`);
  expect(['current', 'downloading']).toContain(state.stage);
  expect(state.version).toMatch(/^\d+\.\d+\.\d+/);
  if (localFeed) {
    expect(state.stage).toBe('downloading');
    expect(state.version).toBe('99.0.0');
    expect(localFeed.requests.feed).toBeGreaterThan(0);
    expect(localFeed.requests.latest).toBeGreaterThan(0);
    expect(localFeed.requests.metadata).toBeGreaterThan(0);
    expect(localFeed.requests.payload).toBe(0);
    expect(localFeed.requests.authenticated).toBe(0);
  }
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile(
    localFeed ? 'artifacts/public-update-fixture-check.json' : 'artifacts/public-update-check.json',
    JSON.stringify(
      {
        passed: true,
        stage: state.stage,
        releaseVersion: state.version,
        authenticated: false,
        packaged: Boolean(process.env.DOCK_EXECUTABLE),
        requests: localFeed?.requests,
      },
      null,
      2,
    ),
  );
  console.log(`PASS anonymous public GitHub update check: ${state.version} (${state.stage}).`);
} finally {
  if (application) await application.close();
  if (localFeed) await localFeed.close();
  await fixture.close();
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
