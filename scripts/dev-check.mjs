import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startFixture } from './fixture.mjs';
const fixture = await startFixture();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dock-dev-'));
const reservation = http.createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const env = {
  ...process.env,
  DOCK_TEST: '1',
  DOCK_TEST_DATA: directory,
  DOCK_FIXTURE: fixture.origin,
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  process.execPath,
  [
    'node_modules/electron-vite/bin/electron-vite.js',
    'dev',
    '--remoteDebuggingPort',
    String(port),
    '--',
    '--dock-test',
  ],
  { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);
const exited = new Promise((resolve) => child.once('exit', resolve));
let logs = '';
child.stdout.on('data', (data) => {
  logs += data.toString();
});
child.stderr.on('data', (data) => {
  logs += data.toString();
});
let browser;
try {
  await expect
    .poll(
      async () => (await fetch(`http://127.0.0.1:${port}/json/version`).catch(() => null))?.status,
      { timeout: 30000 },
    )
    .toBe(200);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser
    .contexts()[0]
    .pages()
    .find(
      (page) => /localhost|127\.0\.0\.1/.test(page.url()) && !page.url().startsWith(fixture.origin),
    );
  if (!page) throw new Error('Development shell did not open.');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'New window', exact: false }).first().click();
  await page.getByRole('heading', { name: 'New window', exact: true }).waitFor();
  expect(errors).toEqual([]);
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/development.png' });
  console.log(
    'PASS real electron-vite development startup, React refresh CSP, and local UI interaction.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (browser) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (!page.url().startsWith(fixture.origin)) await page.close().catch(() => {});
      }
    }
    await browser.close().catch(() => {});
  }
  if (child.exitCode === null) {
    const done = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        timer.unref();
      }),
    ]);
    if (!done) child.kill();
  }
  await fixture.close();
  await fs
    .rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    .catch(() => {});
}
