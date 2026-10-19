import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dock-website-'));
const env = { ...process.env, DOCK_TEST: '1', DOCK_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOCK_FIXTURE;
let application;
try {
  application = await electron.launch({ args: ['.', '--dock-test'], env, timeout: 45000 });
  await application.firstWindow();
  await expect
    .poll(
      () =>
        application
          .context()
          .pages()
          .some((page) => page.url().startsWith('dock://ui/')),
      { timeout: 45000 },
    )
    .toBe(true);
  const page = application
    .context()
    .pages()
    .find((page) => page.url().startsWith('dock://ui/'));
  await page.waitForFunction(() => Boolean(window.dock));
  await expect
    .poll(
      () =>
        application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.getURL(),
        ),
      { timeout: 45000 },
    )
    .toContain('https://chatgpt.com');
  const status = await application.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].contentView.children[0].webContents;
    const info = await contents.executeJavaScript(
      '({ title: document.title, hasContent: document.body.innerText.length > 100, verification: /verify you are human|just a moment|checking your browser/i.test(document.body.innerText), hasLogin: /log in|sign in|sign up/i.test(document.body.innerText) })',
    );
    return { origin: new URL(contents.getURL()).origin, ...info, authenticated: false };
  });
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile('artifacts/website-check.json', JSON.stringify(status, null, 2));
  console.log(JSON.stringify(status));
} finally {
  if (application) await application.close();
  await fs
    .rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 })
    .catch(() => {});
}
