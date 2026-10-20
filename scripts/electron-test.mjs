import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { startFixture } from './fixture.mjs';

const fixture = await startFixture();
const externalFixture = await startFixture();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dock-integration-'));
const output = path.resolve('artifacts');
await fs.mkdir(output, { recursive: true });
const packaged = process.env.DOCK_EXECUTABLE;
let application;
const results = [];
const performanceReport = {
  environment: {
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    node: process.version,
  },
  fixtureMessages: 500,
  measurements: {},
};
const env = {
  ...process.env,
  DOCK_TEST: '1',
  DOCK_TEST_DATA: directory,
  DOCK_FIXTURE: fixture.origin,
};
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  application = await electron.launch({
    ...(packaged
      ? { executablePath: packaged, args: ['--dock-test'] }
      : { args: ['.', '--dock-test'] }),
    env,
    timeout: 45000,
  });
  application.on('console', (message) => {
    if (message.type() === 'error') console.error('[main]', message.text());
  });
  // Stub the OS boundary, not the application's routing: tests must prove that
  // real Electron navigation calls shell.openExternal without launching browsers.
  await application.evaluate(({ app, shell }) => {
    app.__dockExternalCalls = [];
    shell.openExternal = async (url) => {
      app.__dockExternalCalls.push(url);
    };
  });
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
  await page.getByRole('button', { name: 'New window', exact: false }).first().waitFor();
  return page;
}
async function command(page, value) {
  const result = await page.evaluate((value) => window.dock.command(value), value);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function snapshot(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const off = window.dock.subscribe((state) => {
          off();
          resolve(state);
        });
        void window.dock.command({ type: 'snapshot' });
      }),
  );
}
async function remote(windowId) {
  return application.evaluate(({ BrowserWindow }, id) => {
    const win = id
      ? BrowserWindow.fromId(id)
      : BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('dock://'));
    return win.contentView.children[0].webContents.id;
  }, windowId);
}
async function js(id, source) {
  return application.evaluate(
    ({ webContents }, { id, source }) => webContents.fromId(id).executeJavaScript(source, true),
    { id, source },
  );
}
async function waitRemote(id) {
  await expect.poll(() => js(id, 'document.readyState')).toBe('complete');
}
async function viewPage(id) {
  await js(id, `document.documentElement.dataset.dockTestId=${JSON.stringify(String(id))}`);
  for (const page of application.context().pages()) {
    if (
      (await page
        .evaluate(() => document.documentElement.dataset.dockTestId)
        .catch(() => undefined)) === String(id)
    )
      return page;
  }
  throw new Error('Remote view is not exposed to browser automation.');
}
async function sample(label) {
  performanceReport.measurements[label] = await application.evaluate(
    ({ app, webContents, BrowserWindow }) => ({
      processes: app.getAppMetrics().map((m) => ({
        pid: m.pid,
        type: m.type,
        workingSetKB: m.memory.workingSetSize,
        cpu: m.cpu.percentCPUUsage,
      })),
      webContents: webContents.getAllWebContents().length,
      windows: BrowserWindow.getAllWindows().length,
    }),
  );
}
async function check(name, work) {
  await work();
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
try {
  let page = await launch();
  let id = await remote();
  await waitRemote(id);
  const initial = await snapshot(page);
  const profileId = initial.profileId;
  const winId = await application.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id,
  );
  await check(
    'stable window numbers appear in titles and rainbow navigation badges without counting menus',
    async () => {
      const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
      expect(initial.windowNumber).toBe(1);
      await expect(page.getByRole('img', { name: 'Window 1, Red', exact: true })).toBeVisible();
      const title = () =>
        application.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).getTitle(), winId);
      expect(await title()).toMatch(/ — Personal - 1$/);
      await page.getByRole('button', { name: 'Active login profile' }).click();
      await expect.poll(async () => (await snapshot(page)).profileMenuOpen).toBe(true);
      await expect
        .poll(() =>
          application
            .context()
            .pages()
            .some((candidate) => candidate.url().includes('surface=profile-menu')),
        )
        .toBe(true);
      const profileMenu = application
        .context()
        .pages()
        .find((candidate) => candidate.url().includes('surface=profile-menu'));
      await expect(profileMenu.getByRole('menu')).toBeVisible();
      await command(page, { type: 'profile-menu', action: 'close' });
      await expect.poll(() => profileMenu.isClosed()).toBe(true);
      await expect(page.locator('.toast')).toHaveCount(0);
      const records = [];
      await fs.mkdir(path.join(output, 'window-numbers'), { recursive: true });
      for (let number = 2; number <= 9; number++) {
        await command(page, { type: 'new-window', profileId });
        const sibling = await application.evaluate(({ BrowserWindow }, keep) => {
          const win = BrowserWindow.getAllWindows().find(
            (w) =>
              w.id !== keep &&
              !w.getParentWindow() &&
              w.webContents.getURL().startsWith('dock://ui/'),
          );
          return { id: win.id, contents: win.webContents.id, title: win.getTitle() };
        }, winId);
        await expect
          .poll(() => js(sibling.contents, 'document.querySelector(".window-number")?.textContent'))
          .toBe(String(number));
        const badge = await js(
          sibling.contents,
          `(() => {const badge=document.querySelector('.window-number');return {number:badge.textContent,color:badge.dataset.windowColor,width:badge.getBoundingClientRect().width,height:badge.getBoundingClientRect().height};})()`,
        );
        expect(badge).toMatchObject({
          number: String(number),
          color: colors[(number - 1) % 7],
          width: 24,
          height: 24,
        });
        expect(sibling.title).toMatch(new RegExp(` — Personal - ${number}$`));
        expect((await snapshot(page)).windowNumber).toBe(1);
        records.push(badge);
        if (number === 2) {
          for (const theme of ['light', 'dark']) {
            await command(page, { type: 'settings', theme });
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await page
              .locator('.chrome')
              .screenshot({ path: path.join(output, 'window-numbers', `window-1-${theme}.png`) });
            for (const candidate of application.context().pages()) {
              if (candidate === page || !candidate.url().startsWith('dock://ui/')) continue;
              if (
                (await candidate
                  .locator('.window-number')
                  .textContent()
                  .catch(() => '')) === '2'
              )
                await candidate.locator('.chrome').screenshot({
                  path: path.join(output, 'window-numbers', `window-2-${theme}.png`),
                });
            }
          }
          await command(page, { type: 'panel', panel: 'downloads' });
          await expect(page.getByRole('img', { name: 'Window 1, Red', exact: true })).toBeVisible();
          await expect(
            page.getByRole('navigation', { name: 'Panel navigation' }).getByRole('button'),
          ).toHaveCount(1);
          await command(page, { type: 'panel', panel: 'none' });
        }
        await application.evaluate(
          ({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(),
          sibling.id,
        );
      }
      await command(page, { type: 'profile-rename', id: profileId, name: 'Numbered profile' });
      await expect.poll(title).toMatch(/ — Numbered profile - 1$/);
      await command(page, { type: 'profile-rename', id: profileId, name: 'Personal' });
      await expect.poll(title).toMatch(/ — Personal - 1$/);
      await command(page, { type: 'settings', theme: initial.settings.theme });
      await fs.writeFile(
        path.join(output, 'window-numbers', 'verification.json'),
        JSON.stringify({ first: 1, records, passed: true }, null, 2),
      );
    },
  );
  if (process.platform === 'win32') {
    await check(
      'Windows taskbar relaunch identity, icon and shortcut survive a native round trip',
      async () => {
        await application.evaluate(({ app, BrowserWindow }) => {
          app.__dockTaskbar = [];
          app.__dockSetAppDetails = BrowserWindow.prototype.setAppDetails;
          BrowserWindow.prototype.setAppDetails = function (details) {
            app.__dockTaskbar.push({ windowId: this.id, details });
            return app.__dockSetAppDetails.call(this, details);
          };
        });
        try {
          await command(page, { type: 'new-window', profileId });
          const info = await application.evaluate(({ app, BrowserWindow }) => {
            const captured = app.__dockTaskbar[0];
            return {
              ...captured,
              parent: BrowserWindow.fromId(captured.windowId).getParentWindow()?.id,
              packaged: app.isPackaged,
              executable: process.execPath,
              appPath: app.getAppPath(),
            };
          });
          expect(info.details.appId).toBe('io.github.infiniwire.chatty-dock.integration-test');
          expect(info.details.appIconPath).toMatch(/icon\.ico$/);
          expect((await fs.stat(info.details.appIconPath)).size).toBeGreaterThan(0);
          expect(info.details.relaunchCommand).toBe(
            `"${info.executable}"${info.packaged ? '' : ` "${info.appPath}"`}`,
          );
          expect(info.details.relaunchDisplayName).toBe(
            info.packaged ? 'ChattyDock' : 'ChattyDock (Development)',
          );
          const link = path.join(directory, 'ChattyDock taskbar test.lnk');
          const options = {
            target: info.executable,
            cwd: path.dirname(info.executable),
            args: info.packaged ? '' : `"${info.appPath}"`,
            icon: info.details.appIconPath,
            iconIndex: info.details.appIconIndex,
            appUserModelId: info.details.appId,
          };
          const shortcut = await application.evaluate(
            ({ shell }, { link, options }) => {
              if (!shell.writeShortcutLink(link, 'create', options))
                throw new Error('Could not write test shortcut.');
              return shell.readShortcutLink(link);
            },
            { link, options },
          );
          expect(shortcut).toMatchObject(options);
          await application.evaluate(
            ({ BrowserWindow }, windowId) => BrowserWindow.fromId(windowId).close(),
            info.windowId,
          );
        } finally {
          await application.evaluate(({ app, BrowserWindow }) => {
            BrowserWindow.prototype.setAppDetails = app.__dockSetAppDetails;
            delete app.__dockSetAppDetails;
            delete app.__dockTaskbar;
          });
        }
      },
    );
  }
  await check(
    'window layout menu snaps only its owner, restores bounds and respects screen work areas',
    async () => {
      const original = await snapshot(page);
      const ownerState = await application.evaluate(({ BrowserWindow, screen }, id) => {
        const win = BrowserWindow.fromId(id);
        return {
          bounds: win.getBounds(),
          minimum: win.getMinimumSize(),
          maximized: win.isMaximized(),
          area: screen.getDisplayMatching(win.getBounds()).workArea,
        };
      }, winId);
      const layoutTrigger = page.getByRole('button', { name: 'Window layout', exact: true });
      const triggerOrder = await page
        .locator('.topbar')
        .evaluate((element) =>
          [...element.querySelectorAll('button')].map((button) =>
            button.getAttribute('aria-label'),
          ),
        );
      expect(triggerOrder[triggerOrder.indexOf('Downloads') + 1]).toBe('Window layout');
      const websiteBefore = await js(id, 'location.href');
      await command(page, { type: 'new-window', profileId });
      const sibling = await application.evaluate(({ BrowserWindow }, keep) => {
        const win = BrowserWindow.getAllWindows().find((window) => window.id !== keep);
        return { id: win.id, bounds: win.getBounds() };
      }, winId);
      const activeMenu = (candidate) =>
        !candidate.isClosed() && candidate.url().includes('surface=layout-menu');
      async function openLayout() {
        await application.evaluate(({ BrowserWindow }, id) => {
          const win = BrowserWindow.fromId(id);
          win.show();
          win.focus();
          win.webContents.focus();
        }, winId);
        await layoutTrigger.click();
        await expect.poll(() => application.context().pages().some(activeMenu)).toBe(true);
        const menu = application.context().pages().find(activeMenu);
        await menu.getByRole('menuitemradio', { name: 'Left half', exact: true }).waitFor();
        await expect(layoutTrigger).toHaveAttribute('aria-expanded', 'true');
        return menu;
      }
      await fs.mkdir(path.join(output, 'window-layout'), { recursive: true });
      for (const theme of ['dark', 'light']) {
        await command(page, { type: 'settings', theme });
        const menu = await openLayout();
        await expect(menu.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(menu.getByRole('menuitem', { name: 'Restore previous size' })).toBeDisabled();
        const denied = await menu.evaluate(() =>
          window.dock.command({ type: 'profile-switch', id: crypto.randomUUID() }),
        );
        expect(denied.ok).toBe(false);
        await menu.keyboard.press('ArrowRight');
        await expect(
          menu.getByRole('menuitemradio', { name: 'Left half', exact: true }),
        ).toBeFocused();
        await menu.screenshot({ path: path.join(output, 'window-layout', `menu-${theme}.png`) });
        await menu.keyboard.press('Escape').catch((error) => {
          if (!menu.isClosed()) throw error;
        });
        await expect.poll(() => menu.isClosed()).toBe(true);
        await expect(layoutTrigger).toBeFocused();
      }
      const placementsFor = (a) => {
        const left = Math.floor(a.width / 2),
          top = Math.floor(a.height / 2);
        return [
          ['Left half', 'left', { x: a.x, y: a.y, width: left, height: a.height }],
          [
            'Right half',
            'right',
            { x: a.x + left, y: a.y, width: a.width - left, height: a.height },
          ],
          ['Top half', 'top', { x: a.x, y: a.y, width: a.width, height: top }],
          [
            'Bottom half',
            'bottom',
            { x: a.x, y: a.y + top, width: a.width, height: a.height - top },
          ],
          ['Top left quarter', 'top-left', { x: a.x, y: a.y, width: left, height: top }],
          [
            'Top right quarter',
            'top-right',
            { x: a.x + left, y: a.y, width: a.width - left, height: top },
          ],
          [
            'Bottom left quarter',
            'bottom-left',
            { x: a.x, y: a.y + top, width: left, height: a.height - top },
          ],
          [
            'Bottom right quarter',
            'bottom-right',
            { x: a.x + left, y: a.y + top, width: a.width - left, height: a.height - top },
          ],
        ];
      };
      for (const [label, preset] of placementsFor(ownerState.area)) {
        const menu = await openLayout();
        // Activating an app can change macOS Dock/work-area dimensions.
        // Read the same live display area that the command will use, rather than startup geometry.
        const area = await application.evaluate(
          ({ BrowserWindow, screen }, id) =>
            screen.getDisplayMatching(BrowserWindow.fromId(id).getBounds()).workArea,
          winId,
        );
        const expected = placementsFor(area).find((item) => item[1] === preset)[2];
        await menu
          .getByRole('menuitemradio', { name: label, exact: true })
          .click()
          .catch((error) => {
            if (!menu.isClosed()) throw error;
          });
        await expect
          .poll(() =>
            application.evaluate(
              ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(),
              winId,
            ),
          )
          .toEqual(expected);
        await expect.poll(() => menu.isClosed()).toBe(true);
        await expect.poll(async () => (await snapshot(page)).windowLayout).toBe(preset);
        expect(await remote(winId)).toBe(id);
        expect(await js(id, 'location.href')).toBe(websiteBefore);
      }
      let menu = await openLayout();
      await menu
        .getByRole('menuitemradio', { name: 'Fill screen', exact: true })
        .click()
        .catch((error) => {
          if (!menu.isClosed()) throw error;
        });
      await expect
        .poll(() =>
          application.evaluate(
            ({ BrowserWindow }, id) => BrowserWindow.fromId(id).isMaximized(),
            winId,
          ),
        )
        .toBe(true);
      menu = await openLayout();
      await expect(
        menu.getByRole('menuitemradio', { name: 'Fill screen', exact: true }),
      ).toHaveAttribute('aria-checked', 'true');
      await menu
        .getByRole('menuitem', { name: 'Restore previous size' })
        .click()
        .catch((error) => {
          if (!menu.isClosed()) throw error;
        });
      await expect
        .poll(async () => {
          const current = await application.evaluate(
            ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(),
            winId,
          );
          return ['x', 'y', 'width', 'height'].every(
            (key) => Math.abs(current[key] - ownerState.bounds[key]) <= 1,
          );
        })
        .toBe(true);
      expect(
        await application.evaluate(
          ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getMinimumSize(),
          winId,
        ),
      ).toEqual(ownerState.minimum);
      expect((await snapshot(page)).canRestoreWindowLayout).toBe(false);
      expect(
        await application.evaluate(
          ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(),
          sibling.id,
        ),
      ).toEqual(sibling.bounds);
      await application.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(),
        sibling.id,
      );
      await command(page, { type: 'settings', theme: original.settings.theme });
    },
  );
  await check('downloads empty state, keyboard return, themes and compact toolbar', async () => {
    const original = await snapshot(page);
    const bounds = await application.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(),
      winId,
    );
    await fs.mkdir(path.join(output, 'ui-review'), { recursive: true });
    await application.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id).setSize(1280, 820),
      winId,
    );
    const trigger = page.getByRole('button', { name: 'Downloads', exact: true });
    await trigger.click();
    await expect(page.getByRole('heading', { name: 'Downloads', exact: true })).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Website navigation' })).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Panel navigation' }).getByRole('button'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Your downloads, all in one place' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear finished' })).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await command(page, { type: 'settings', theme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: path.join(output, 'ui-review', 'downloads-empty-light.png') });
    await command(page, { type: 'settings', theme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: path.join(output, 'ui-review', 'downloads-empty-dark.png') });
    await page.getByText('About your downloads', { exact: true }).click();
    await expect(
      page.getByText(/Clearing finished entries does not delete your files/),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await application.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id).setSize(740, 650),
      winId,
    );
    await trigger.click();
    await expect(page.getByRole('heading', { name: 'Downloads', exact: true })).toBeFocused();
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('.topbar');
      return {
        overflow: bar.scrollWidth > bar.clientWidth,
        right: document.querySelector('.settings-button').getBoundingClientRect().right,
        width: innerWidth,
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.right).toBeLessThanOrEqual(layout.width);
    await page.screenshot({ path: path.join(output, 'ui-review', 'downloads-compact-dark.png') });
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole('navigation', { name: 'Website navigation' }).getByRole('button'),
    ).toHaveCount(4);
    const websiteBefore = await js(id, 'location.href');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Panel navigation' }).getByRole('button'),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Website navigation' })).toBeVisible();
    expect(await remote(winId)).toBe(id);
    expect(await js(id, 'location.href')).toBe(websiteBefore);
    await command(page, { type: 'settings', theme: original.settings.theme });
    await application.evaluate(
      ({ BrowserWindow }, { id, bounds }) => BrowserWindow.fromId(id).setBounds(bounds),
      { id: winId, bounds },
    );
  });
  await check('sandboxed remote view and rejected untrusted IPC', async () => {
    expect(await js(id, '({node:typeof process,bridge:typeof window.dock})')).toEqual({
      node: 'undefined',
      bridge: 'undefined',
    });
    const result = await application.evaluate(async ({ BrowserWindow, app }, origin) => {
      const preload = `${app.getAppPath()}/out/preload/index.js`;
      const rogue = new BrowserWindow({
        show: false,
        webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      await rogue.loadURL(origin);
      const answer = await rogue.webContents.executeJavaScript(
        'window.dock.command({type:"new-window"})',
      );
      rogue.destroy();
      return answer;
    }, fixture.origin);
    expect(result).toEqual({ ok: false, error: 'Untrusted IPC sender.' });
    expect(
      (await page.evaluate(() => window.dock.command({ type: 'profile-switch', id: '../bad' }))).ok,
    ).toBe(false);
  });
  await application.evaluate(
    async ({ session }, { profileId, origin }) => {
      await session.fromPartition(`persist:profile-${profileId}`).cookies.set({
        url: origin,
        name: 'dock-auth',
        value: 'valid',
        expirationDate: Date.now() / 1000 + 86400,
      });
    },
    { profileId, origin: fixture.origin },
  );
  await js(id, 'localStorage.setItem("sentinel","personal")');
  const other = await command(page, { type: 'profile-create', name: 'Work' });
  await check(
    'native profile dropdown themes, keyboard, isolation, dismissal and IPC scope',
    async () => {
      const original = await snapshot(page);
      const trigger = page.getByRole('button', { name: 'Active login profile' });
      const isMenu = (candidate) =>
        candidate.url().includes('surface=profile-menu') && !candidate.isClosed();
      async function openMenu() {
        await application.evaluate(({ BrowserWindow }, id) => {
          const owner = BrowserWindow.fromId(id);
          owner.show();
          owner.focus();
          owner.webContents.focus();
        }, winId);
        await trigger.click();
        await expect.poll(() => application.context().pages().some(isMenu)).toBe(true);
        const menu = application.context().pages().find(isMenu);
        await menu.getByRole('menuitemradio', { name: 'Personal', exact: true }).waitFor();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        return menu;
      }
      await fs.mkdir(path.join(output, 'profile-dropdown'), { recursive: true });
      for (const theme of ['dark', 'light']) {
        await command(page, { type: 'settings', theme });
        const menu = await openMenu();
        await expect(menu.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(
          menu.getByRole('menuitemradio', { name: 'Personal', exact: true }),
        ).toBeFocused();
        const native = await application.evaluate(({ BrowserWindow }, id) => {
          const owner = BrowserWindow.fromId(id);
          const menu = owner.getChildWindows()[0];
          const preferences = menu.webContents.getLastWebPreferences();
          return {
            parent: menu.getParentWindow().id,
            visible: owner.contentView.children[0].getVisible(),
            sandbox: preferences.sandbox,
            isolated: preferences.contextIsolation,
            node: preferences.nodeIntegration,
            ownerBounds: owner.getBounds(),
            menuBounds: menu.getBounds(),
          };
        }, winId);
        expect(native).toMatchObject({
          parent: winId,
          visible: true,
          sandbox: true,
          isolated: true,
          node: false,
        });
        expect(native.menuBounds.y).toBeGreaterThan(native.ownerBounds.y);
        const colors = await menu.getByRole('menu').evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          overflow: element.scrollHeight > element.clientHeight,
        }));
        expect(colors.background).toBe(theme === 'dark' ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)');
        expect(colors.overflow).toBe(false);
        const denied = await menu.evaluate(() => window.dock.command({ type: 'new-window' }));
        expect(denied.ok).toBe(false);
        await menu.keyboard.press('ArrowDown');
        await expect(menu.getByRole('menuitemradio', { name: 'Work', exact: true })).toBeFocused();
        await menu.keyboard.press('End');
        await expect(menu.getByRole('menuitem', { name: 'Manage profiles' })).toBeFocused();
        await menu.keyboard.press('Home');
        await expect(
          menu.getByRole('menuitemradio', { name: 'Personal', exact: true }),
        ).toBeFocused();
        await menu.screenshot({
          path: path.join(output, 'profile-dropdown', `dropdown-${theme}.png`),
        });
        await menu.keyboard.press('Escape').catch((error) => {
          if (!menu.isClosed()) throw error;
        });
        await expect.poll(() => menu.isClosed()).toBe(true);
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      }
      let menu = await openMenu();
      await menu.keyboard.press('w');
      await expect(menu.getByRole('menuitemradio', { name: 'Work', exact: true })).toBeFocused();
      await menu.keyboard.press('Enter').catch((error) => {
        if (!menu.isClosed()) throw error;
      });
      await expect.poll(async () => (await snapshot(page)).profileId).toBe(other.id);
      await expect.poll(() => menu.isClosed()).toBe(true);
      id = await remote(winId);
      await waitRemote(id);
      expect(await js(id, 'localStorage.getItem("sentinel")')).toBeNull();
      menu = await openMenu();
      await menu
        .getByRole('menuitemradio', { name: 'Personal', exact: true })
        .click()
        .catch((error) => {
          if (!menu.isClosed()) throw error;
        });
      await expect.poll(() => menu.isClosed()).toBe(true);
      id = await remote(winId);
      await waitRemote(id);
      expect(await js(id, 'localStorage.getItem("sentinel")')).toBe('personal');
      menu = await openMenu();
      await menu
        .getByRole('menuitem', { name: 'Manage profiles' })
        .click()
        .catch((error) => {
          if (!menu.isClosed()) throw error;
        });
      await expect.poll(() => menu.isClosed()).toBe(true);
      await expect(
        page.getByRole('heading', { name: 'Login profiles', exact: true }),
      ).toBeFocused();
      await command(page, { type: 'panel', panel: 'none' });
      menu = await openMenu();
      await trigger.click();
      await expect.poll(() => menu.isClosed()).toBe(true);
      menu = await openMenu();
      await application.evaluate(({ BrowserWindow }, id) => {
        const owner = BrowserWindow.fromId(id);
        owner.focus();
        owner.contentView.children[0].webContents.focus();
      }, winId);
      await expect.poll(() => menu.isClosed()).toBe(true);
      menu = await openMenu();
      await menu.keyboard.press('Tab').catch((error) => {
        if (!menu.isClosed()) throw error;
      });
      await expect.poll(() => menu.isClosed()).toBe(true);
      await expect(trigger).toBeFocused();
      await command(page, { type: 'settings', theme: original.settings.theme });
    },
  );
  await check(
    'same profile shares cookies and localStorage; another profile is isolated',
    async () => {
      await command(page, { type: 'new-window', profileId });
      const remoteIds = await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((w) => w.webContents.getURL().startsWith('dock://'))
          .map((w) => w.contentView.children[0].webContents.id),
      );
      const sharedId = remoteIds.find((value) => value !== id);
      await waitRemote(sharedId);
      expect(await js(sharedId, 'document.cookie')).toContain('dock-auth=valid');
      expect(await js(sharedId, 'localStorage.getItem("sentinel")')).toBe('personal');
      await command(page, { type: 'new-window', profileId: other.id });
      await expect
        .poll(() =>
          application.evaluate(
            ({ BrowserWindow }) =>
              BrowserWindow.getAllWindows().filter((w) => / — Work - \d+$/.test(w.getTitle()))
                .length,
          ),
        )
        .toBe(1);
      const isolated = await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().find((w) => / — Work - \d+$/.test(w.getTitle())).contentView
            .children[0].webContents.id,
      );
      await waitRemote(isolated);
      expect(await js(isolated, 'document.cookie')).not.toContain('dock-auth');
      expect(await js(isolated, 'localStorage.getItem("sentinel")')).toBeNull();
      await js(
        isolated,
        'localStorage.setItem("sentinel","work");document.cookie="work-session=other; Max-Age=86400"',
      );
      await command(page, { type: 'profile-rename', id: other.id, name: 'Office' });
      expect(await js(isolated, 'localStorage.getItem("sentinel")')).toBe('work');
    },
  );
  await check(
    'shared login keeps independent app modes through preference broadcasts, focus and server-rendered reloads',
    async () => {
      // Negative control: the website's cookie/broadcast mechanism really does
      // navigate an unpinned sibling. Only synthetic loopback documents run here.
      const controls = await application.evaluate(
        async ({ BrowserWindow, webContents }, { id, origin }) => {
          const ses = webContents.fromId(id).session;
          await ses.cookies.remove(origin, 'codex_app_mode');
          const options = {
            show: false,
            webPreferences: {
              session: ses,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
            },
          };
          const sender = new BrowserWindow(options);
          const receiver = new BrowserWindow(options);
          await Promise.all([
            sender.loadURL(`${origin}/surface-fixture-chat`),
            receiver.loadURL(`${origin}/surface-fixture-chat`),
          ]);
          return {
            windows: [sender.id, receiver.id],
            sender: sender.webContents.id,
            receiver: receiver.webContents.id,
          };
        },
        { id, origin: fixture.origin },
      );
      try {
        await js(controls.sender, 'window.surfaceFixture.select("STEPS_EXECUTION");true');
        await expect
          .poll(() => js(controls.receiver, 'location.pathname'))
          .toBe('/surface-fixture-codex');
      } finally {
        await application.evaluate(
          async ({ BrowserWindow, webContents }, { controls, id, origin }) => {
            for (const windowId of controls.windows) BrowserWindow.fromId(windowId)?.close();
            await webContents.fromId(id).session.cookies.remove(origin, 'codex_app_mode');
          },
          { controls, id, origin: fixture.origin },
        );
      }
      await application.evaluate(
        async ({ webContents }, { id, origin }) => {
          await webContents.fromId(id).session.cookies.set({
            url: origin,
            name: 'dock-private-auth',
            value: 'fixture-secret',
            httpOnly: true,
          });
          await webContents.fromId(id).loadURL(`${origin}/surface-fixture-chat`);
        },
        { id, origin: fixture.origin },
      );
      const existingWindows = await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => w.id),
      );
      await command(page, { type: 'new-window', profileId });
      const sibling = await application.evaluate(
        ({ BrowserWindow, webContents }, { id, existingWindows }) => {
          const original = webContents.fromId(id);
          const win = BrowserWindow.getAllWindows().find(
            (w) =>
              !existingWindows.includes(w.id) &&
              w.contentView.children[0]?.webContents !== original &&
              w.contentView.children[0]?.webContents.session === original.session &&
              !w.getParentWindow(),
          );
          return { id: win.id, contents: win.contentView.children[0].webContents.id };
        },
        { id, existingWindows },
      );
      // A new window starts its homepage independently of the local toolbar.
      // Wait for that navigation to settle before replacing it with this fixture.
      await expect
        .poll(() =>
          application.evaluate(
            ({ webContents }, { id, origin }) => {
              const contents = webContents.fromId(id);
              return contents.getURL().startsWith(`${origin}/`) && !contents.isLoading();
            },
            { id: sibling.contents, origin: fixture.origin },
          ),
        )
        .toBe(true);
      await application.evaluate(
        async ({ webContents }, { id, origin }) => {
          await webContents.fromId(id).loadURL(`${origin}/surface-fixture-chat`);
        },
        { id: sibling.contents, origin: fixture.origin },
      );
      try {
        await expect
          .poll(() => js(sibling.contents, 'typeof window.surfaceFixture'))
          .toBe('object');
        await js(id, 'document.querySelector("#choose-codex").click();true');
        await expect.poll(() => js(id, 'location.pathname')).toBe('/surface-fixture-codex');
        // Await a same-channel round trip so this checks the receiving window,
        // rather than passing before its preference event has been delivered.
        await js(
          sibling.contents,
          `window.surfaceFixtureBarrier=new Promise(resolve=>{const channel=new BroadcastChannel('codex:preference-cookies');channel.onmessage=e=>{if(e.data==='fixture-barrier'){channel.close();resolve(true);}};});true`,
        );
        await js(
          id,
          `(()=>{const channel=new BroadcastChannel('codex:preference-cookies');channel.postMessage('fixture-barrier');channel.close();})()`,
        );
        await js(sibling.contents, 'window.surfaceFixtureBarrier');
        await js(sibling.contents, 'window.dispatchEvent(new Event("focus"));true');
        expect(await js(sibling.contents, 'location.pathname')).toBe('/surface-fixture-chat');
        expect(await js(sibling.contents, 'window.surfaceFixture.currentMode()')).toBe(
          'STEPS_PROSE',
        );
        await js(sibling.contents, 'window.surfaceFixture.select("STEPS_PROSE");true');
        await application.evaluate(async ({ webContents }, id) => {
          const contents = webContents.fromId(id);
          const loaded = new Promise((resolve) => contents.once('did-finish-load', resolve));
          contents.reload();
          await loaded;
        }, id);
        await expect
          .poll(() => js(id, 'document.querySelector("#server-mode")?.textContent'))
          .toBe('STEPS_EXECUTION');
        expect(await js(id, 'document.querySelector("#server-auth").textContent')).toBe('true');
        expect(await js(id, 'document.cookie')).not.toContain('dock-private-auth');
        await js(id, 'window.dispatchEvent(new Event("focus"));true');
        expect(await js(id, 'location.pathname')).toBe('/surface-fixture-codex');
        expect(await js(sibling.contents, 'location.pathname')).toBe('/surface-fixture-chat');
        expect(
          await js(sibling.contents, 'document.querySelector("#server-auth").textContent'),
        ).toBe('true');
        await js(id, 'document.cookie="dock-shared-check=valid; Path=/";true');
        expect(await js(sibling.contents, 'document.cookie')).toContain('dock-shared-check=valid');
        expect(await js(id, '({node:typeof process, bridge:typeof window.dock})')).toEqual({
          node: 'undefined',
          bridge: 'undefined',
        });
      } finally {
        await application.evaluate(
          ({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(),
          sibling.id,
        );
        await command(page, { type: 'navigate', action: 'home' });
        await waitRemote(id);
      }
    },
  );
  await check('switching profiles replaces the remote view and keeps both sessions', async () => {
    const oldId = id;
    await command(page, { type: 'profile-switch', id: other.id });
    id = await remote(winId);
    await waitRemote(id);
    expect(id).not.toBe(oldId);
    expect(await js(id, 'localStorage.getItem("sentinel")')).toBe('work');
    expect(await js(id, 'document.cookie')).not.toContain('dock-auth=valid');
    await command(page, { type: 'profile-default', id: other.id });
    expect((await snapshot(page)).settings.defaultProfileId).toBe(other.id);
    await command(page, { type: 'profile-default', id: profileId });
    await command(page, { type: 'profile-switch', id: profileId });
    id = await remote(winId);
    await waitRemote(id);
    expect(await js(id, 'localStorage.getItem("sentinel")')).toBe('personal');
  });
  await check(
    'toolbar follows chat/composer font changes, zoom, navigation and per-window typography',
    async () => {
      const size = () =>
        page.locator('.chrome').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const aligned = async (expected) => {
        await expect.poll(size).toBe(Math.max(12, expected - 2));
        await expect
          .poll(async () => {
            const height = await page
              .locator('.chrome')
              .evaluate((el) => el.getBoundingClientRect().height);
            return application.evaluate(
              ({ BrowserWindow }, { winId, height }) =>
                BrowserWindow.fromId(winId).contentView.children[0].getBounds().y === height,
              { winId, height },
            );
          })
          .toBe(true);
      };
      await js(
        id,
        `document.body.insertAdjacentHTML('afterbegin','<div id="prompt-textarea" contenteditable="true" style="font-size:18px;min-height:24px">Fixture composer</div>')`,
      );
      await aligned(18);
      await js(
        id,
        `document.body.insertAdjacentHTML('afterbegin','<article id="font-fixture" data-message-author-role="assistant"><div class="markdown" style="font-size:20px">Synthetic chat content</div></article>')`,
      );
      await aligned(20);
      expect(
        await page
          .getByRole('button', { name: 'Home', exact: true })
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe('18px');
      await js(id, `document.querySelector('#font-fixture .markdown').style.fontSize='22px'`);
      await aligned(22);
      await js(
        id,
        `document.head.insertAdjacentHTML('beforeend','<style>.fixture-large .markdown{font-size:24px}</style>');document.querySelector('#font-fixture .markdown').style.fontSize='';document.documentElement.classList.add('fixture-large')`,
      );
      await aligned(24);
      await js(
        id,
        `document.querySelector('#font-fixture .markdown').insertAdjacentHTML('beforeend','<p style="font-size:26px">Nested chat text</p>')`,
      );
      await aligned(26);
      await js(id, `document.querySelector('#font-fixture .markdown p').remove()`);
      await aligned(24);
      const sharedWindow = await application.evaluate(
        ({ BrowserWindow }, winId) =>
          BrowserWindow.getAllWindows().find(
            (win) => win.id !== winId && / — Personal - \d+$/.test(win.getTitle()),
          ).webContents.id,
        winId,
      );
      const sharedSize = () =>
        js(
          sharedWindow,
          'parseFloat(getComputedStyle(document.querySelector(".chrome")).fontSize)',
        );
      expect(await sharedSize()).toBe(14);
      await js(id, `console.debug('dock-font-forged:64')`);
      expect(await size()).toBe(22);
      for (let step = 0; step < 10; step++)
        await command(page, { type: 'navigate', action: 'zoom-in' });
      await aligned(48);
      await expect.poll(sharedSize).toBe(30);
      await command(page, { type: 'navigate', action: 'zoom-reset' });
      await aligned(24);
      await command(page, { type: 'navigate', action: 'reload' });
      await waitRemote(id);
      await aligned(16);
      expect(await js(id, 'typeof globalThis.__dockTypography')).toBe('undefined');
    },
  );
  await check('popup uses initiating session and unsafe popups are blocked', async () => {
    await js(id, `window.open(${JSON.stringify(`${fixture.origin}/popup`)});true`);
    await expect
      .poll(() =>
        application.evaluate(
          ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('/popup'))
              .length,
        ),
      )
      .toBe(1);
    const cookie = await application.evaluate(async ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('/popup'))
        .webContents.executeJavaScript('document.cookie'),
    );
    expect(cookie).toContain('dock-auth=valid');
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('/popup'))
        .close(),
    );
    await js(id, 'window.open("file:///not-allowed");true');
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().startsWith('file:')),
      ),
    ).toBe(false);
  });
  await check(
    'Google account bridge redirects retain the initiating session, POST and cookies without browser dispatch',
    async () => {
      const originalCalls = await application.evaluate(({ app }) => app.__dockExternalCalls.length);
      // Replace HTTPS responses only in this synthetic profile. No Google/OpenAI
      // network traffic or real authorization parameters are used by this check.
      await application.evaluate(async ({ app, webContents, session }, id) => {
        const ses = webContents.fromId(id).session;
        app.__dockAuthFixture = [];
        await ses.cookies.set({
          url: 'https://accounts.google.com',
          name: 'dock-google-fixture',
          value: 'valid',
          secure: true,
        });
        await ses.cookies.set({
          url: 'https://accounts.youtube.com',
          name: 'dock-bridge-fixture',
          value: 'valid',
          secure: true,
        });
        const isolated = session.fromPartition('dock-auth-fixture-isolated');
        if ((await isolated.cookies.get({ name: 'dock-google-fixture' })).length)
          throw new Error('Fixture session is not isolated');
        ses.protocol.handle('https', async (request) => {
          const url = new URL(request.url);
          const body = request.method === 'POST' ? await request.text() : '';
          app.__dockAuthFixture.push({
            host: url.hostname,
            path: url.pathname,
            method: request.method,
            body,
          });
          if (url.hostname === 'accounts.google.com' && url.pathname === '/dock-auth-start')
            return new Response(
              '<!doctype html><form method="post" action="https://accounts.google.com/dock-auth-post"><input name="fixture" value="synthetic-only"><button>Continue fixture</button></form>',
              { headers: { 'content-type': 'text/html' } },
            );
          const next = {
            'accounts.google.com/dock-auth-post': 'https://accounts.youtube.com/dock-auth-bridge',
            'accounts.youtube.com/dock-auth-bridge':
              'https://accounts.google.com/dock-auth-consent',
            'accounts.google.com/dock-auth-consent': 'https://auth.openai.com/dock-auth-callback',
            'auth.openai.com/dock-auth-callback': 'https://chatgpt.com/dock-auth-done',
          }[url.hostname + url.pathname];
          if (next) return new Response(null, { status: 303, headers: { location: next } });
          if (url.hostname === 'chatgpt.com' && url.pathname === '/dock-auth-done')
            return new Response('<!doctype html><h1>Synthetic authentication complete</h1>', {
              headers: { 'content-type': 'text/html' },
            });
          return new Response('Unexpected synthetic authentication request', { status: 404 });
        });
      }, id);
      try {
        await command(page, { type: 'sign-in-trace', action: 'start' });
        await application.evaluate(async ({ webContents }, id) => {
          await webContents.fromId(id).loadURL('https://accounts.google.com/dock-auth-start');
        }, id);
        expect(await js(id, 'document.cookie')).toContain('dock-google-fixture=valid');
        await js(id, 'document.querySelector("form").submit();true');
        await expect.poll(() => js(id, 'location.href')).toBe('https://chatgpt.com/dock-auth-done');
        expect(await js(id, 'document.body.textContent')).toContain(
          'Synthetic authentication complete',
        );
        // Popups must retain the same session and survive this bridge as well.
        await js(id, 'window.open("https://accounts.google.com/dock-auth-start");true');
        await expect
          .poll(() =>
            application.evaluate(({ BrowserWindow }) =>
              BrowserWindow.getAllWindows().some(
                (w) => w.webContents.getURL() === 'https://accounts.google.com/dock-auth-start',
              ),
            ),
          )
          .toBe(true);
        const popup = await application.evaluate(({ BrowserWindow, webContents }, id) => {
          const win = BrowserWindow.getAllWindows().find(
            (w) => w.webContents.getURL() === 'https://accounts.google.com/dock-auth-start',
          );
          if (win.webContents.session !== webContents.fromId(id).session)
            throw new Error('Authentication popup lost its session');
          return win.webContents.id;
        }, id);
        expect(await js(popup, 'document.cookie')).toContain('dock-google-fixture=valid');
        await js(popup, 'document.querySelector("form").submit();true');
        await expect
          .poll(() => js(popup, 'location.href'))
          .toBe('https://chatgpt.com/dock-auth-done');
        const requests = await application.evaluate(({ app }) => app.__dockAuthFixture);
        await fs.writeFile(
          path.join(output, 'auth-bridge-fixture.json'),
          JSON.stringify(requests, null, 2),
        );
        const post = requests.filter((r) => r.path === '/dock-auth-post');
        expect(post).toHaveLength(2);
        expect(post.every((r) => r.method === 'POST' && r.body === 'fixture=synthetic-only')).toBe(
          true,
        );
        const bridge = requests.filter((r) => r.host === 'accounts.youtube.com');
        expect(bridge).toHaveLength(2);
        expect(bridge.every((r) => r.method === 'GET')).toBe(true);
        // The protocol fixture's Request does not expose a Cookie header.
        // Check Chromium's cookie store plus document.cookie in both windows;
        // actual provider-server cookie transmission remains a manual check.
        const cookieState = await application.evaluate(async ({ webContents, session }, id) => {
          const ses = webContents.fromId(id).session;
          return {
            google: (
              await ses.cookies.get({
                url: 'https://accounts.google.com',
                name: 'dock-google-fixture',
              })
            ).map((c) => c.value),
            bridge: (
              await ses.cookies.get({
                url: 'https://accounts.youtube.com',
                name: 'dock-bridge-fixture',
              })
            ).map((c) => c.value),
            isolated: (await session.fromPartition('dock-auth-fixture-isolated').cookies.get({}))
              .length,
          };
        }, id);
        expect(cookieState).toEqual({ google: ['valid'], bridge: ['valid'], isolated: 0 });
        expect(await application.evaluate(({ app }) => app.__dockExternalCalls.length)).toBe(
          originalCalls,
        );
        await command(page, { type: 'sign-in-trace', action: 'copy' });
        const trace = JSON.parse(
          await application.evaluate(({ clipboard }) => clipboard.readText()),
        );
        const bridgeTrace = trace.events.filter((e) => e.to === 'https://accounts.youtube.com');
        expect(bridgeTrace.length).toBeGreaterThan(0);
        expect(bridgeTrace.every((e) => e.kind === 'auth' && e.action === 'embedded')).toBe(true);
        await application.evaluate(({ webContents }, id) => webContents.fromId(id).close(), popup);
      } finally {
        await command(page, { type: 'sign-in-trace', action: 'clear' });
        await application.evaluate(
          ({ webContents }, id) => webContents.fromId(id).session.protocol.unhandle('https'),
          id,
        );
        await command(page, { type: 'navigate', action: 'home' });
        await waitRemote(id);
      }
    },
  );
  await check(
    'external links, scripted navigation, popups and redirects use the OS browser',
    async () => {
      const remotePage = await viewPage(id);
      const originalURL = await js(id, 'location.href');
      const calls = () => application.evaluate(({ app }) => app.__dockExternalCalls);
      let expected = [];
      const routed = async (url, action) => {
        await action();
        expected.push(url);
        await expect.poll(calls).toEqual(expected);
        expect(await js(id, 'location.href')).toBe(originalURL);
      };
      await routed('https://twitter.com/dock-link', async () => {
        await js(
          id,
          `document.body.insertAdjacentHTML('afterbegin','<a id="external-link" href="https://twitter.com/dock-link">External</a>')`,
        );
        await remotePage.locator('#external-link').click({ noWaitAfter: true });
      });
      await routed('https://x.com/dock-blank', () =>
        js(id, 'window.open("https://x.com/dock-blank");true'),
      );
      await routed('https://www.youtube.com/watch?v=dock-fixture', () =>
        js(id, 'window.open("https://www.youtube.com/watch?v=dock-fixture");true'),
      );
      await routed('https://accounts.youtube.com.attacker.example/', () =>
        js(id, 'location.assign("https://accounts.youtube.com.attacker.example/");true'),
      );
      await routed('https://x.com/dock-target-blank', async () => {
        await js(
          id,
          `document.body.insertAdjacentHTML('afterbegin','<a id="external-blank" target="_blank" href="https://x.com/dock-target-blank">External new tab</a>')`,
        );
        // Chromium cancels this navigation; a second Playwright locator action
        // would wait for the cancelled navigation before dispatching its click.
        await js(id, 'document.querySelector("#external-blank").click();true');
      });
      await routed('http://example.com/dock-http', () =>
        js(id, 'location.assign("http://example.com/dock-http");true'),
      );
      await routed('https://x.com/dock-replace', () =>
        js(id, 'location.replace("https://x.com/dock-replace");true'),
      );
      await routed('https://x.com/dock-form?', () =>
        js(
          id,
          `(() => { const form=document.createElement('form');form.action='https://x.com/dock-form';document.body.append(form);form.submit(); })()`,
        ),
      );
      await routed('https://x.com/dock-redirect', () =>
        js(id, `location.href=${JSON.stringify(`${fixture.origin}/external-redirect`)};true`),
      );
      // Newly created, allowed popups must not escape via their first HTTP redirect.
      await routed('https://x.com/dock-redirect', () =>
        js(id, `window.open(${JSON.stringify(`${fixture.origin}/external-redirect`)});true`),
      );
      await js(
        id,
        `window.open(${JSON.stringify(`${fixture.origin}/popup`)},'dock-safe-popup');true`,
      );
      await expect
        .poll(() =>
          application.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith('/popup')),
          ),
        )
        .toBe(true);
      await routed('https://twitter.com/dock-existing-popup', () =>
        js(id, 'window.open("https://twitter.com/dock-existing-popup","dock-safe-popup");true'),
      );
      await application.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.webContents.getURL().startsWith('dock://')) win.close();
        }
      });
      await js(
        id,
        'window.open("file:///not-allowed");window.open("javascript:alert(1)");window.open("data:text/html,blocked");true',
      );
      expect(await calls()).toEqual(expected);
      // Exercise the request backstop: loadURL bypasses will-navigate in Electron.
      await routed('https://x.com/dock-load-url', () =>
        application.evaluate(async ({ webContents }, id) => {
          await webContents
            .fromId(id)
            .loadURL('https://x.com/dock-load-url')
            .catch(() => {});
        }, id),
      );
      await routed(`${externalFixture.origin}/must-not-be-requested`, () =>
        application.evaluate(
          async ({ webContents }, { id, url }) => {
            await webContents
              .fromId(id)
              .loadURL(url)
              .catch(() => {});
          },
          { id, url: `${externalFixture.origin}/must-not-be-requested` },
        ),
      );
      expect(externalFixture.requestCount).toBe(0);
      // Subresources still work; only top-level browsing is restricted.
      expect(
        await js(
          id,
          `fetch(${JSON.stringify(`${externalFixture.origin}/resource`)},{mode:'no-cors'}).then(()=>true)`,
        ),
      ).toBe(true);
      expect(externalFixture.requestCount).toBe(1);
      expect(await calls()).toEqual(expected);
      expect((await snapshot(page)).error).toBeNull();
      await command(page, { type: 'navigate', action: 'home' });
      await waitRemote(id);
    },
  );
  await check(
    'opt-in sign-in diagnostics capture browser dispatch without authorization data and stay per-window',
    async () => {
      await command(page, { type: 'panel', panel: 'diagnostics' });
      await expect(page.getByRole('button', { name: 'Copy sign-in report' })).toBeDisabled();
      await page.getByRole('button', { name: 'Start recording', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).panel).toBe('none');
      const sensitiveURL =
        'https://auth-bridge.example/PRIVATE_PATH?state=PRIVATE_QUERY#PRIVATE_FRAGMENT';
      await js(id, `window.open(${JSON.stringify(sensitiveURL)});true`);
      await application.evaluate(
        async ({ webContents }, { id, url }) => {
          await webContents
            .fromId(id)
            .loadURL(url)
            .catch(() => {});
        },
        { id, url: sensitiveURL },
      );
      await command(page, { type: 'panel', panel: 'diagnostics' });
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await page.getByRole('button', { name: 'Copy sign-in report' }).click();
      await expect(page.getByText('Report copied.', { exact: true })).toBeVisible();
      const report = await application.evaluate(({ clipboard }) => clipboard.readText());
      expect(report).not.toMatch(/PRIVATE_|auth-bridge\.example\//);
      const events = JSON.parse(report).events;
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'popup',
            to: 'https://auth-bridge.example',
            action: 'browser',
          }),
          expect.objectContaining({
            event: 'request',
            to: 'https://auth-bridge.example',
            action: 'browser',
            method: 'GET',
          }),
        ]),
      );
      const other = application
        .context()
        .pages()
        .find(
          (p) => p !== page && p.url().startsWith('dock://ui/') && !p.url().includes('surface='),
        );
      expect(other).toBeTruthy();
      expect((await snapshot(other)).signInTrace.count).toBe(0);
      await page.getByRole('button', { name: 'Clear report' }).click();
      await expect(page.getByRole('button', { name: 'Copy sign-in report' })).toBeDisabled();
      expect((await snapshot(page)).signInTrace.recording).toBe(false);
      await command(page, { type: 'panel', panel: 'none' });
      await command(page, { type: 'navigate', action: 'home' });
      await waitRemote(id);
    },
  );
  await check('file selection, file drag/drop and image clipboard paste', async () => {
    const remotePage = await viewPage(id);
    const file = path.join(directory, 'upload.txt');
    await fs.writeFile(file, 'fixture-upload');
    await remotePage.locator('#files').setInputFiles(file);
    await expect
      .poll(() => js(id, 'document.querySelector("#upload-result").textContent'))
      .toBe('14');
    await js(
      id,
      `(() => { const data=new DataTransfer(); data.items.add(new File(['dropped'],'drop.txt')); document.querySelector('#drop').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true})); })()`,
    );
    await expect
      .poll(() => js(id, 'document.querySelector("#upload-result").textContent'))
      .toBe('7');
    await application.evaluate(async ({ clipboard, nativeImage, ClipboardItem, app }, icon) => {
      app.__dockClipboard = await clipboard.read();
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([nativeImage.createFromPath(icon).toPNG()], { type: 'image/png' }),
        }),
      ]);
    }, path.resolve('build/icon.png'));
    try {
      await remotePage.locator('#drop').focus();
      await application.evaluate(({ webContents }, id) => webContents.fromId(id).paste(), id);
      await expect
        .poll(async () =>
          Number(await js(id, 'document.querySelector("#upload-result").textContent')),
        )
        .toBeGreaterThan(7);
    } finally {
      await application.evaluate(async ({ clipboard, ClipboardItem, app }) => {
        if (app.__dockClipboard?.length) {
          const entries = await Promise.all(
            app.__dockClipboard
              .filter((item) => item.types.length > 0)
              .map(
                async (item) =>
                  new ClipboardItem(
                    Object.fromEntries(
                      await Promise.all(
                        item.types.map(async (type) => [type, await item.getType(type)]),
                      ),
                    ),
                  ),
              ),
          );
          if (entries.length) await clipboard.write(entries);
          else clipboard.clear();
        } else clipboard.clear();
        delete app.__dockClipboard;
      });
    }
  });
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, directory);
  await command(page, { type: 'directory' });
  await command(page, { type: 'settings', askDownload: false });
  await check('authenticated downloads, unique filenames and no duplicate listeners', async () => {
    for (let i = 0; i < 2; i++)
      await application.evaluate(
        ({ webContents }, { id, origin }) =>
          webContents.fromId(id).downloadURL(`${origin}/download`),
        { id, origin: fixture.origin },
      );
    await expect
      .poll(
        async () => (await snapshot(page)).downloads.filter((d) => d.state === 'completed').length,
      )
      .toBe(2);
    const list = (await snapshot(page)).downloads;
    expect(list).toHaveLength(2);
    expect(list[0].path).not.toBe(list[1].path);
    for (const d of list) expect((await fs.stat(d.path)).size).toBe(4096);
  });
  await check('download list exposes working file actions in light and dark themes', async () => {
    await application.evaluate(({ app, shell }) => {
      app.__dockFileCalls = [];
      shell.openPath = async (value) => {
        app.__dockFileCalls.push({ action: 'open', value });
        return '';
      };
      shell.showItemInFolder = (value) => {
        app.__dockFileCalls.push({ action: 'reveal', value });
      };
    });
    await page.getByRole('button', { name: 'Downloads', exact: true }).click();
    await expect(
      page.getByRole('list', { name: 'Downloaded files' }).getByRole('listitem'),
    ).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Clear finished', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Open file', exact: true }).first().click();
    await page.getByRole('button', { name: 'Show in folder', exact: true }).first().click();
    await expect.poll(() => application.evaluate(({ app }) => app.__dockFileCalls.length)).toBe(2);
    const calls = await application.evaluate(({ app }) => app.__dockFileCalls);
    expect(calls.map((call) => call.action)).toEqual(['open', 'reveal']);
    expect(calls[0].value).toBe((await snapshot(page)).downloads[0].path);
    const theme = (await snapshot(page)).settings.theme;
    for (const value of ['light', 'dark']) {
      await command(page, { type: 'settings', theme: value });
      await expect(page.locator('html')).toHaveAttribute('data-theme', value);
      await page.screenshot({
        path: path.join(output, 'ui-review', `downloads-files-${value}.png`),
      });
    }
    await command(page, { type: 'settings', theme });
    await page.keyboard.press('Escape');
  });
  await check('download pause, resume, cancel and interrupted failure', async () => {
    await application.evaluate(
      ({ webContents }, { id, origin }) => webContents.fromId(id).downloadURL(`${origin}/slow`),
      { id, origin: fixture.origin },
    );
    await expect
      .poll(async () => (await snapshot(page)).downloads.filter((d) => d.active).length)
      .toBe(1);
    const download = (await snapshot(page)).downloads.find((d) => d.active);
    await command(page, { type: 'download', id: download.id, action: 'pause' });
    await expect
      .poll(async () => (await snapshot(page)).downloads.find((d) => d.id === download.id).state)
      .toBe('paused');
    await page.getByRole('button', { name: 'Downloads', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume download', exact: true })).toBeVisible();
    await expect(
      page.getByRole('progressbar', {
        name: `Download progress for ${download.filename}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: path.join(output, 'ui-review', 'downloads-paused.png') });
    await page.getByRole('button', { name: 'Resume download', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause download', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel download', exact: true }).click();
    await expect
      .poll(async () => (await snapshot(page)).downloads.find((d) => d.id === download.id).state)
      .toBe('cancelled');
    await page.keyboard.press('Escape');
    await application.evaluate(
      ({ webContents }, { id, origin }) => webContents.fromId(id).downloadURL(`${origin}/broken`),
      { id, origin: fixture.origin },
    );
    await expect
      .poll(async () => (await snapshot(page)).downloads.some((d) => d.state === 'interrupted'), {
        timeout: 30000,
      })
      .toBe(true);
  });
  await check('navigation history and long conversation measurements', async () => {
    await application.evaluate(
      ({ webContents }, { id, origin }) => webContents.fromId(id).loadURL(`${origin}/long`),
      { id, origin: fixture.origin },
    );
    await waitRemote(id);
    expect(await js(id, 'document.querySelectorAll("article").length')).toBe(500);
    const remotePage = await viewPage(id);
    const start = performance.now();
    await remotePage
      .locator('#input')
      .fill('Input remains editable while the conversation streams.');
    const elapsed = performance.now() - start;
    performanceReport.measurements.inputAutomationMs = elapsed;
    expect(await remotePage.locator('#input').inputValue()).toContain('editable');
    const scrolling = await js(
      id,
      'new Promise(resolve=>{const samples=[];let last=performance.now(),n=0;function step(now){samples.push(now-last);last=now;window.scrollBy(0,220);if(++n<120)requestAnimationFrame(step);else resolve({frames:120,averageFrameMs:samples.reduce((a,b)=>a+b,0)/samples.length,maxFrameMs:Math.max(...samples),scrollY});}requestAnimationFrame(step);})',
    );
    expect(scrolling.scrollY).toBeGreaterThan(0);
    performanceReport.measurements.scrolling = scrolling;
    await sample('threeWindows');
    await command(page, { type: 'navigate', action: 'back' });
    await expect
      .poll(() =>
        application.evaluate(({ webContents }, id) => webContents.fromId(id).getURL(), id),
      )
      .not.toContain('/long');
  });
  await check('second launch opens another window in the existing coordinator', async () => {
    const before = await application.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    );
    const executable = packaged || (await import('electron')).default;
    const child = spawn(executable, packaged ? ['--dock-test'] : ['.', '--dock-test'], {
      env,
      stdio: 'ignore',
      windowsHide: true,
    });
    const finished = new Promise((resolve) => child.once('exit', resolve));
    await expect
      .poll(
        () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        { timeout: 15000 },
      )
      .toBe(before + 1);
    await finished;
  });
  await check('closing windows releases their remote WebContents', async () => {
    await application.evaluate(({ BrowserWindow }, keep) => {
      for (const win of BrowserWindow.getAllWindows()) if (win.id !== keep) win.close();
    }, winId);
    await expect
      .poll(() => application.evaluate(({ webContents }) => webContents.getAllWebContents().length))
      .toBe(2);
    await application.evaluate(
      ({ webContents }, { id, origin }) => webContents.fromId(id).loadURL(`${origin}/long`),
      { id, origin: fixture.origin },
    );
    await waitRemote(id);
    await sample('oneWindow');
    for (let i = 0; i < 4; i++) {
      await command(page, { type: 'new-window', profileId });
      await application.evaluate(({ BrowserWindow }, keep) => {
        for (const win of BrowserWindow.getAllWindows()) if (win.id !== keep) win.close();
      }, winId);
    }
    await expect
      .poll(() => application.evaluate(({ webContents }) => webContents.getAllWebContents().length))
      .toBe(2);
    await sample('afterFourOpenCloseCycles');
  });
  await check('a download survives closing its window and releases the retained view', async () => {
    await command(page, { type: 'new-window', profileId });
    const source = await application.evaluate(({ BrowserWindow }, keep) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.id !== keep);
      return { windowId: win.id, contentsId: win.contentView.children[0].webContents.id };
    }, winId);
    await waitRemote(source.contentsId);
    await application.evaluate(
      ({ webContents }, { id, origin }) => webContents.fromId(id).downloadURL(`${origin}/slow`),
      { id: source.contentsId, origin: fixture.origin },
    );
    await expect
      .poll(async () =>
        (await snapshot(page)).downloads.some((d) => d.windowId === source.windowId && d.active),
      )
      .toBe(true);
    const blocked = await application.evaluate(
      async ({ BrowserWindow }, { windowId, profileId }) =>
        BrowserWindow.fromId(windowId).webContents.executeJavaScript(
          'window.dock.command({type:"profile-switch",id:' + JSON.stringify(profileId) + '})',
        ),
      { windowId: source.windowId, profileId: other.id },
    );
    expect(blocked).toEqual({
      ok: false,
      error: 'Finish this window’s downloads before switching profiles.',
    });
    await application.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(),
      source.windowId,
    );
    await expect
      .poll(
        async () =>
          (await snapshot(page)).downloads.some(
            (d) => d.windowId === source.windowId && d.state === 'completed',
          ),
        { timeout: 20000 },
      )
      .toBe(true);
    await expect
      .poll(() => application.evaluate(({ webContents }) => webContents.getAllWebContents().length))
      .toBe(2);
  });
  await check('profile deletion isolates cleanup from another profile', async () => {
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await command(page, { type: 'profile-delete', id: other.id });
    expect((await snapshot(page)).settings.profiles.some((p) => p.id === other.id)).toBe(false);
    expect(await js(id, 'localStorage.getItem("sentinel")')).toBe('personal');
    const erased = await application.evaluate(
      async ({ session }, { id, origin }) =>
        session.fromPartition(`persist:profile-${id}`).cookies.get({ url: origin }),
      { id: other.id, origin: fixture.origin },
    );
    expect(erased).toHaveLength(0);
  });
  await check(
    'new-window UI reuses logins, creates isolated profiles and retains actionable errors',
    async () => {
      await fs.mkdir(path.join(output, 'ui-round2'), { recursive: true });
      const trigger = page.getByRole('button', { name: 'New window', exact: true });
      const windowCount = () =>
        application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
      const closeAddedWindows = () =>
        application.evaluate(({ BrowserWindow }, keep) => {
          for (const window of BrowserWindow.getAllWindows())
            if (window.id !== keep) window.close();
        }, winId);
      await trigger.click();
      await expect(page.getByRole('radio', { name: /Reuse a login/ })).toBeChecked();
      await page.getByRole('button', { name: 'Open window', exact: true }).click();
      await expect.poll(windowCount).toBe(2);
      await expect.poll(async () => (await snapshot(page)).panel).toBe('none');
      await closeAddedWindows();
      await expect.poll(windowCount).toBe(1);
      await trigger.click();
      await page.getByRole('radio', { name: /Keep it separate/ }).check();
      const nameInput = page.getByRole('textbox', { name: 'New profile name', exact: true });
      await expect(nameInput).toBeFocused();
      await nameInput.fill('Studio UI');
      await page.screenshot({ path: path.join(output, 'ui-round2', 'new-separate.png') });
      await page.getByRole('button', { name: 'Create & open', exact: true }).click();
      await expect.poll(windowCount).toBe(2);
      const studio = (await snapshot(page)).settings.profiles.find(
        (profile) => profile.name === 'Studio UI',
      );
      expect(studio.id).not.toBe(profileId);
      await expect.poll(async () => (await snapshot(page)).panel).toBe('none');
      await trigger.click();
      await page.getByRole('button', { name: 'Manage login profiles', exact: true }).click();
      await page.getByLabel('More actions for Studio UI', { exact: true }).click();
      await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Close all windows');
      await expect(page.getByRole('alert')).toBeFocused();
      expect((await snapshot(page)).panel).toBe('profiles');
      expect(
        (await snapshot(page)).settings.profiles.some((profile) => profile.id === studio.id),
      ).toBe(true);
      await closeAddedWindows();
      await expect.poll(windowCount).toBe(1);
      await page.getByLabel('More actions for Studio UI', { exact: true }).click();
      await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).settings.profiles.length).toBe(1);
      await page.keyboard.press('Escape');
    },
  );
  await check(
    'profile menus, inline rename, default selection and add/delete work by keyboard and pointer',
    async () => {
      await page.getByRole('button', { name: 'New window', exact: true }).click();
      await page.getByRole('button', { name: 'Manage login profiles', exact: true }).click();
      await page.getByRole('textbox', { name: 'Profile name', exact: true }).fill('Research');
      await page.getByRole('button', { name: 'Create profile', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeVisible();
      const menu = page.getByLabel('More actions for Research', { exact: true });
      await menu.click();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeHidden();
      expect((await snapshot(page)).panel).toBe('profiles');
      await menu.click();
      await page.getByRole('button', { name: 'Rename', exact: true }).click();
      const rename = page.getByRole('textbox', { name: 'Rename profile', exact: true });
      await expect(rename).toBeFocused();
      await rename.fill('Discard this edit');
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeVisible();
      await menu.click();
      await page.getByRole('button', { name: 'Rename', exact: true }).click();
      await rename.fill('Research workspace');
      await page.getByRole('button', { name: 'Save name', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Research workspace', exact: true }),
      ).toBeVisible();
      const renamedMenu = page.getByLabel('More actions for Research workspace', { exact: true });
      await expect(renamedMenu).toBeFocused();
      await renamedMenu.click();
      await page.getByRole('button', { name: 'Make default', exact: true }).click();
      await expect
        .poll(async () => (await snapshot(page)).settings.defaultProfileId)
        .not.toBe(profileId);
      await expect(renamedMenu).toBeFocused();
      const renamedRow = page.getByRole('listitem').filter({ has: renamedMenu });
      await expect(renamedRow.getByText('Default', { exact: true })).toBeVisible();
      await expect(
        renamedRow.getByRole('button', { name: 'Open window', exact: true }),
      ).toBeEnabled();
      await page.screenshot({ path: path.join(output, 'ui-round2', 'profiles-managed.png') });
      await page.getByLabel('More actions for Personal', { exact: true }).click();
      await page.getByRole('button', { name: 'Make default', exact: true }).click();
      await expect
        .poll(async () => (await snapshot(page)).settings.defaultProfileId)
        .toBe(profileId);
      await renamedMenu.click();
      await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).settings.profiles.length).toBe(1);
      await page.keyboard.press('Escape');
    },
  );
  await check(
    'settings categories save theme, zoom, download behavior and folders without exposing update tokens',
    async () => {
      const original = (await snapshot(page)).settings;
      const bounds = await application.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(),
        winId,
      );
      await application.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id).setSize(1280, 860),
        winId,
      );
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const categories = page.getByRole('navigation', { name: 'Settings categories', exact: true });
      for (const theme of ['light', 'dark']) {
        await page
          .getByRole('group', { name: 'Theme', exact: true })
          .getByRole('button', { name: theme, exact: false })
          .click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.screenshot({
          path: path.join(output, 'ui-round2', `settings-appearance-${theme}.png`),
        });
      }
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).settings.zoom).toBeGreaterThan(1);
      await page.getByRole('button', { name: 'Reset to 100%', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).settings.zoom).toBe(1);
      await categories.getByRole('button', { name: 'Downloads', exact: true }).click();
      const saveSwitch = page.getByRole('switch', { name: /Ask where to save each file/ });
      await saveSwitch.click();
      await expect
        .poll(async () => (await snapshot(page)).settings.askDownload)
        .toBe(!original.askDownload);
      await saveSwitch.setChecked(original.askDownload);
      const folder = path.join(directory, 'ui-save-folder');
      await fs.mkdir(folder, { recursive: true });
      await application.evaluate(({ dialog }, value) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [value] });
      }, folder);
      await page.getByRole('button', { name: 'Change', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Default folder', exact: true })).toHaveValue(
        folder,
      );
      await application.evaluate(({ dialog }, value) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [value] });
      }, original.downloadDirectory);
      await page.getByRole('button', { name: 'Change', exact: true }).click();
      await expect
        .poll(async () => (await snapshot(page)).settings.downloadDirectory)
        .toBe(original.downloadDirectory);
      await page.screenshot({ path: path.join(output, 'ui-round2', 'settings-downloads.png') });
      await categories.getByRole('button', { name: 'Updates', exact: true }).click();
      const token = page.getByLabel('GitHub update token', { exact: true });
      await expect(token).toBeHidden();
      await page.getByText('Private repository access', { exact: true }).click();
      await token.fill('SYNTHETIC_NOT_A_CREDENTIAL');
      await categories.getByRole('button', { name: 'Appearance', exact: true }).click();
      await categories.getByRole('button', { name: 'Updates', exact: true }).click();
      await page.getByText('Private repository access', { exact: true }).click();
      await expect(token).toHaveValue('');
      expect(JSON.stringify(await snapshot(page))).not.toContain('SYNTHETIC_NOT_A_CREDENTIAL');
      await page.screenshot({ path: path.join(output, 'ui-round2', 'settings-updates.png') });
      await application.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id).setSize(740, 650),
        winId,
      );
      await categories.getByRole('button', { name: 'Appearance', exact: true }).click();
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        right: document.querySelector('.settings-content').getBoundingClientRect().right,
        overflow:
          document.querySelector('.workspace').scrollWidth >
          document.querySelector('.workspace').clientWidth,
      }));
      expect(layout.right).toBeLessThanOrEqual(layout.width);
      expect(layout.overflow).toBe(false);
      await page.screenshot({ path: path.join(output, 'ui-round2', 'settings-compact.png') });
      await categories.getByRole('button', { name: 'Advanced', exact: true }).click();
      await page.getByRole('button', { name: 'Manage profiles', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Login profiles', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await command(page, { type: 'settings', theme: original.theme });
      await application.evaluate(
        ({ BrowserWindow }, { id, bounds }) => BrowserWindow.fromId(id).setBounds(bounds),
        { id: winId, bounds },
      );
    },
  );
  await check(
    'About exposes version, update state, release notes and browser-only project links',
    async () => {
      await fs.mkdir(path.join(output, 'about'), { recursive: true });
      const initial = await snapshot(page);
      const bounds = await application.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getBounds(),
        winId,
      );
      await application.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id).setSize(1280, 900),
        winId,
      );
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const categories = page.getByRole('navigation', { name: 'Settings categories', exact: true });
      await categories.getByRole('button', { name: 'About', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'ChattyDock', exact: true })).toBeVisible();
      await expect(page.locator('.about-build')).toContainText(`Version ${initial.version}`);
      await expect(page.getByRole('heading', { name: 'In this build', exact: true })).toHaveCount(
        0,
      );
      await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Development build', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Up to date', exact: true })).toHaveCount(0);
      for (const theme of ['light', 'dark']) {
        await command(page, { type: 'settings', theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page
          .locator('.panel')
          .screenshot({ path: path.join(output, 'about', `about-${theme}.png`) });
      }
      const actual = await snapshot(page);
      const fixtureState = {
        ...actual,
        update: {
          stage: 'downloading',
          message: 'Downloading update in the background…',
          version: '0.3.0',
          percent: 42,
          checkedAt: Date.now(),
          releaseDate: '2026-10-19T08:00:00.000Z',
          releaseNotes:
            'Improved multi-window profiles.\n<img src=x onerror=alert(1)> is text, not markup.',
        },
      };
      await application.evaluate(
        ({ BrowserWindow }, { id, state }) => {
          const contents = BrowserWindow.fromId(id).webContents;
          const original = contents.send;
          contents.__dockOriginalSend = original;
          // Isolate this renderer-only fixture from the normal debounced state stream.
          contents.send = function (channel, ...args) {
            if (channel !== 'dock:state') return original.call(this, channel, ...args);
          };
          original.call(contents, 'dock:state', state);
        },
        { id: winId, state: fixtureState },
      );
      try {
        await expect(
          page.getByRole('progressbar', { name: 'Update download progress', exact: true }),
        ).toHaveAttribute('value', '42');
        await expect(
          page.getByRole('heading', { name: 'Release notes · 0.3.0', exact: true }),
        ).toBeVisible();
        await expect(page.locator('.about-release-notes')).toContainText(
          '<img src=x onerror=alert(1)>',
        );
        await expect(page.locator('.about-release-notes img')).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Check for updates', exact: true }),
        ).toBeDisabled();
        await expect(page.locator('.about-checked')).toContainText('Last successful check:');
      } finally {
        await application.evaluate(({ BrowserWindow }, id) => {
          const contents = BrowserWindow.fromId(id).webContents;
          contents.send = contents.__dockOriginalSend;
          delete contents.__dockOriginalSend;
        }, winId);
      }
      await command(page, { type: 'snapshot' });
      await page.getByRole('button', { name: 'Version history', exact: true }).click();
      await page.getByRole('button', { name: 'Project on GitHub', exact: true }).click();
      const external = await application.evaluate(({ app }) => app.__dockExternalCalls);
      expect(external).toContain('https://github.com/infiniwire/chatty-dock/releases');
      expect(external).toContain('https://github.com/infiniwire/chatty-dock');
      expect(await js(id, 'location.origin')).toBe(fixture.origin);
      await page.getByRole('button', { name: 'Update settings', exact: true }).click();
      await expect(
        categories.getByRole('button', { name: 'Updates', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await command(page, { type: 'panel', panel: 'about' });
      await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Update settings', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Automatic updates', exact: true }),
      ).toBeVisible();
      await expect(
        categories.getByRole('button', { name: 'Updates', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Escape');
      await command(page, { type: 'settings', theme: initial.settings.theme });
      await application.evaluate(
        ({ BrowserWindow }, { id, bounds }) => BrowserWindow.fromId(id).setBounds(bounds),
        { id: winId, bounds },
      );
    },
  );
  await check('local settings and profile UI render without errors', async () => {
    await command(page, { type: 'panel', panel: 'settings' });
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'settings.png') });
    await command(page, { type: 'panel', panel: 'new' });
    await page.getByRole('heading', { name: 'New window', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'new-window.png') });
    await command(page, { type: 'settings', theme: 'dark' });
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
      .toBe('rgb(0, 0, 0)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: path.join(output, 'dark.png') });
    await application.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id).setSize(740, 650),
      winId,
    );
    await page.screenshot({ path: path.join(output, 'compact.png') });
    await command(page, { type: 'settings', theme: 'system' });
    await command(page, { type: 'panel', panel: 'none' });
  });
  if (process.platform === 'win32')
    await check(
      'update credentials are OS-encrypted and excluded from renderer snapshots',
      async () => {
        const token = 'github_pat_SYNTHETIC_DO_NOT_USE';
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page
          .getByRole('navigation', { name: 'Settings categories', exact: true })
          .getByRole('button', { name: 'Updates', exact: true })
          .click();
        await page.getByText('Private repository access', { exact: true }).click();
        await page.getByLabel('GitHub update token', { exact: true }).fill(token);
        await page.getByRole('button', { name: 'Save token', exact: true }).click();
        await expect(
          page.getByRole('status').filter({ hasText: 'Update access saved.' }),
        ).toBeVisible();
        const encrypted = await fs.readFile(path.join(directory, 'update-token.enc'));
        expect(encrypted.includes(Buffer.from(token))).toBe(false);
        const decrypted = await application.evaluate(
          async ({ safeStorage }, value) =>
            (await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))).result,
          encrypted.toString('base64'),
        );
        expect(decrypted).toBe(token);
        expect(JSON.stringify(await snapshot(page))).not.toContain(token);
        await page.getByRole('button', { name: 'Remove saved token', exact: true }).click();
        await expect(
          page.getByRole('status').filter({ hasText: 'Saved token removed.' }),
        ).toBeVisible();
        await expect(fs.access(path.join(directory, 'update-token.enc'))).rejects.toThrow();
        await page.keyboard.press('Escape');
      },
    );
  await check('settings and session survive a full restart', async () => {
    await application.close();
    application = undefined;
    page = await launch();
    id = await remote();
    await waitRemote(id);
    expect((await snapshot(page)).profileId).toBe(profileId);
    expect((await snapshot(page)).windowNumber).toBe(1);
    await expect(page.getByRole('img', { name: 'Window 1, Red', exact: true })).toBeVisible();
    expect(await js(id, 'document.cookie')).toContain('dock-auth=valid');
    expect(await js(id, 'localStorage.getItem("sentinel")')).toBe('personal');
    expect((await snapshot(page)).downloads.filter((d) => d.state === 'completed')).toHaveLength(3);
  });
  await fs.writeFile(
    path.join(output, 'performance.json'),
    JSON.stringify(performanceReport, null, 2),
  );
  console.log(
    `Passed ${results.length} Electron integration checks${packaged ? ' against the packaged application' : ''}.`,
  );
} catch (error) {
  console.error(error);
  if (application) {
    for (const page of application.context().pages()) {
      await page
        .screenshot({ path: path.join(output, `failure-${Date.now()}.png`), timeout: 5000 })
        .catch(() => {});
    }
  }
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    path.join(output, packaged ? 'packaged-tests.json' : 'electron-tests.json'),
    JSON.stringify(
      {
        passed: !process.exitCode,
        checks: results,
        realChatGPT: 'Not tested; authenticated manual verification required.',
      },
      null,
      2,
    ),
  );
  if (application) await application.close().catch(() => {});
  await fixture.close();
  await externalFixture.close();
  await fs
    .rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 })
    .catch(() => {});
}
