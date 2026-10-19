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
              BrowserWindow.getAllWindows().filter((w) => w.getTitle().endsWith('Work')).length,
          ),
        )
        .toBe(1);
      const isolated = await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().find((w) => w.getTitle().endsWith('Work')).contentView
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
        await expect.poll(size).toBe(expected);
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
      ).toBe('20px');
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
            (win) => win.id !== winId && win.getTitle().endsWith('Personal'),
          ).webContents.id,
        winId,
      );
      const sharedSize = () =>
        js(
          sharedWindow,
          'parseFloat(getComputedStyle(document.querySelector(".chrome")).fontSize)',
        );
      expect(await sharedSize()).toBe(16);
      await js(id, `console.debug('dock-font-forged:64')`);
      expect(await size()).toBe(24);
      for (let step = 0; step < 10; step++)
        await command(page, { type: 'navigate', action: 'zoom-in' });
      await aligned(48);
      await expect.poll(sharedSize).toBe(32);
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
    await command(page, { type: 'download', id: download.id, action: 'resume' });
    await command(page, { type: 'download', id: download.id, action: 'cancel' });
    await expect
      .poll(async () => (await snapshot(page)).downloads.find((d) => d.id === download.id).state)
      .toBe('cancelled');
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
        await command(page, { type: 'update-token', token });
        const encrypted = await fs.readFile(path.join(directory, 'update-token.enc'));
        expect(encrypted.includes(Buffer.from(token))).toBe(false);
        const decrypted = await application.evaluate(
          async ({ safeStorage }, value) =>
            (await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))).result,
          encrypted.toString('base64'),
        );
        expect(decrypted).toBe(token);
        expect(JSON.stringify(await snapshot(page))).not.toContain(token);
        await command(page, { type: 'update-token', token: '' });
        await expect(fs.access(path.join(directory, 'update-token.enc'))).rejects.toThrow();
      },
    );
  await check('settings and session survive a full restart', async () => {
    await application.close();
    application = undefined;
    page = await launch();
    id = await remote();
    await waitRemote(id);
    expect((await snapshot(page)).profileId).toBe(profileId);
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
