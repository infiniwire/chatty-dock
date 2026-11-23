import { _electron as electron, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture } from './fixture.mjs';

const fixture = await startFixture();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dock-startup-'));
const profileId = randomUUID();
const stalledProfileId = randomUUID();
await fs.writeFile(
  path.join(directory, 'settings.json'),
  JSON.stringify({
    version: 1,
    profiles: [
      { id: profileId, name: 'Personal' },
      { id: stalledProfileId, name: 'Stalled' },
    ],
    defaultProfileId: profileId,
    downloadDirectory: directory,
    askDownload: true,
    theme: 'system',
    maximized: false,
    lastLocations: { [stalledProfileId]: `${fixture.origin}/startup-hang-once` },
    zoom: 1,
  }),
);
const env = {
  ...process.env,
  DOCK_TEST: '1',
  DOCK_TEST_DATA: directory,
  DOCK_FIXTURE: fixture.origin,
  DOCK_TEST_STARTUP_TIMEOUT_MS: '800',
};
delete env.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await electron.launch({
    ...(process.env.DOCK_EXECUTABLE
      ? { executablePath: process.env.DOCK_EXECUTABLE, args: ['--dock-test'] }
      : { args: ['.', '--dock-test'] }),
    env,
    timeout: 45000,
  });
  await application.firstWindow();
  await expect
    .poll(
      () =>
        application
          .context()
          .pages()
          .some((page) => page.url().startsWith('dock://ui/')),
      {
        timeout: 45000,
      },
    )
    .toBe(true);
  const owner = application
    .context()
    .pages()
    .find((page) => page.url().startsWith('dock://ui/'));
  await owner.waitForFunction(() => Boolean(window.dock));
  const result = await owner.evaluate(
    (id) => window.dock.command({ type: 'new-window', profileId: id }),
    stalledProfileId,
  );
  expect(result.ok).toBe(true);
  // Playwright exposes both shell windows and remote WebContentsViews as pages.
  // A delayed event for the first window's fixture can arrive after this command.
  // Select the new shell by its own window number, not by event arrival order.
  let page;
  await expect
    .poll(
      async () => {
        for (const candidate of application.context().pages()) {
          if (candidate === owner || !candidate.url().startsWith('dock://ui/')) continue;
          const number = await candidate
            .locator('.window-number')
            .textContent()
            .catch(() => null);
          if (number === '2') {
            page = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 45000 },
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({
    timeout: 5000,
  });
  // Slow runners can display the synthetic timeout before the first request
  // reaches the fixture. Ensure the intended stalled request actually exists
  // before retrying; otherwise the retry itself would be the first stalled one.
  await expect.poll(() => fixture.stalledStartupRequests, { timeout: 45000 }).toBe(1);
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/startup-recovery.png' });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => fixture.stalledStartupRequests, { timeout: 10000 }).toBe(2);
  await expect
    .poll(
      () =>
        application.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((item) =>
            item.getTitle().includes('Stalled'),
          );
          return win.contentView.children[0].webContents.getURL();
        }),
      { timeout: 10000 },
    )
    .toContain('/startup-hang-once');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeHidden();
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((item) =>
          item.getTitle().includes('Stalled'),
        );
        return win.contentView.children[0].webContents.executeJavaScript('document.title');
      }),
    )
    .toBe('Dock test fixture');
  console.log('PASS stalled initial website load exposes a working retry.');
} finally {
  if (application) await application.close();
  await fixture.close();
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
