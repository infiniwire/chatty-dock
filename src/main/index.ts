import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  dialog,
  shell,
  screen,
  Menu,
  nativeTheme,
  protocol,
  net,
  type WebContents,
  type Session,
  type IpcMainInvokeEvent,
} from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { access, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { commandSchema, type Command, type Snapshot, type Panel } from '../shared/model';
import { HOME, urlKind, isEmbeddedURL, clampBounds } from './policy';
import { Store } from './store';
import { Downloads } from './downloads';
import { Updates } from './updates';
import { ChatTypography, toolbarHeight } from './typography';

protocol.registerSchemesAsPrivileged([
  { scheme: 'dock', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const testMode = process.env.DOCK_TEST === '1' && process.argv.includes('--dock-test');
const fixture = testMode ? process.env.DOCK_FIXTURE : undefined;
if (fixture && !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture))
  throw new Error('Invalid fixture origin.');
if (testMode && process.env.DOCK_TEST_DATA)
  app.setPath('userData', path.resolve(process.env.DOCK_TEST_DATA));
const updateE2e = ['chatty-dock-update-test', 'ChattyDock Update Test'].includes(app.getName());
app.setName(updateE2e ? 'ChattyDock Update Test' : 'ChattyDock');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
type WindowEntry = {
  win: BrowserWindow;
  view: WebContentsView;
  profileId: string;
  panel: Panel;
  loading: boolean;
  error: string | null;
  notice: string | null;
  title: string;
  fontSize: number;
  typography?: ChatTypography;
};
const windows = new Map<number, WindowEntry>();
const retired = new Map<number, WebContentsView>();
const owners = new Map<number, number>();
const popups = new Map<number, { win: BrowserWindow; profileId: string }>();
const configured = new Set<Session>();
const deletingProfiles = new Set<string>();
let store: Store;
let downloads: Downloads;
let updates: Updates;
let quitting = false;
let quitPending = false;
let flushComplete = false;
let updateShutdown = false;
let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
const uiOrigin = 'dock://ui';
const devOrigin = process.env.ELECTRON_RENDERER_URL;
const uiPath = path.resolve(__dirname, '../renderer');

function requireProfile(id: string): void {
  if (deletingProfiles.has(id)) throw new Error('This profile is being deleted.');
  if (!store.settings.profiles.some((p) => p.id === id)) throw new Error('Profile does not exist.');
}
function focused(): WindowEntry | undefined {
  const window = BrowserWindow.getFocusedWindow();
  return window ? windows.get(window.id) : windows.values().next().value;
}
function emit(entry: WindowEntry): void {
  if (entry.win.isDestroyed() || entry.win.webContents.isLoadingMainFrame()) return;
  const contents = entry.view.webContents;
  const snapshot: Snapshot = {
    settings: store.settings,
    profileId: entry.profileId,
    panel: entry.panel,
    title: entry.title,
    typography: { fontSize: entry.fontSize, toolbarHeight: toolbarHeight(entry.fontSize) },
    loading: entry.loading,
    error: entry.error,
    canGoBack: !contents.isDestroyed() && contents.navigationHistory.canGoBack(),
    canGoForward: !contents.isDestroyed() && contents.navigationHistory.canGoForward(),
    downloads: downloads.records,
    platform: process.platform,
    version: app.getVersion(),
    notice: entry.notice,
    update: updates?.state ?? { stage: 'idle', message: 'Starting update service…' },
  };
  entry.win.webContents.send('dock:state', snapshot);
  entry.win.setTitle(
    `ChattyDock — ${store.settings.profiles.find((p) => p.id === entry.profileId)?.name ?? 'Profile'}`,
  );
  entry.view.setVisible(entry.panel === 'none' && !entry.error);
}
function changed(): void {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = undefined;
    for (const entry of windows.values()) emit(entry);
    void updates?.maybeInstall();
    for (const [id, view] of retired) {
      if (!downloads.hasActive(undefined, id)) {
        view.webContents.close();
        retired.delete(id);
      }
    }
    if (!windows.size && !downloads.hasActive() && process.platform !== 'darwin' && !quitting)
      app.quit();
  }, 100);
}
async function openExternal(raw: string): Promise<void> {
  if (!['content', 'auth', 'external'].includes(urlKind(raw, fixture)))
    throw new Error('This link cannot be opened.');
  await shell.openExternal(raw);
}
function configureSession(profileId: string): Session {
  const ses = session.fromPartition(`persist:profile-${profileId}`);
  if (configured.has(ses)) return ses;
  configured.add(ses);
  // A session-level backstop also covers initial popup requests and loadURL/history
  // APIs, which do not emit will-navigate. Never apply this to website resources.
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (details.resourceType !== 'mainFrame' || isEmbeddedURL(details.url, fixture)) {
      callback({});
      return;
    }
    // Returning to the last committed safe URL avoids Chromium committing an
    // error document for a denied programmatic loadURL request.
    const previous = details.webContents?.getURL();
    callback({
      redirectURL: previous && isEmbeddedURL(previous, fixture) ? previous : fixture || HOME,
    });
    if (urlKind(details.url, fixture) === 'external')
      void openExternal(details.url).catch(() => {});
  });
  ses.setPermissionCheckHandler(() => false);
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (
      permission !== 'media' ||
      urlKind(details.requestingUrl, fixture) !== 'content' ||
      urlKind(contents.getURL(), fixture) !== 'content'
    ) {
      callback(false);
      return;
    }
    const owner = windows.get(owners.get(contents.id) ?? -1);
    if (!owner) {
      callback(false);
      return;
    }
    void dialog
      .showMessageBox(owner.win, {
        type: 'question',
        title: 'Media permission',
        message: 'Allow this ChatGPT page to use your microphone or camera?',
        detail:
          'This approval applies to this request only. Your operating system may also ask for permission.',
        buttons: ['Deny', 'Allow'],
        defaultId: 0,
        cancelId: 0,
      })
      .then((result) => callback(result.response === 1))
      .catch(() => callback(false));
  });
  downloads.attach(ses, profileId);
  return ses;
}
function secureRemote(contents: WebContents, profileId: string, ownerId: number): void {
  owners.set(contents.id, ownerId);
  contents.once('destroyed', () => owners.delete(contents.id));
  const guard = (event: Electron.Event & { url: string; isMainFrame: boolean }): void => {
    if (!event.isMainFrame || isEmbeddedURL(event.url, fixture)) return;
    event.preventDefault();
    if (urlKind(event.url, fixture) === 'external') void openExternal(event.url).catch(() => {});
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    const kind = urlKind(url, fixture);
    if (kind === 'auth' || kind === 'content') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 620,
          height: 780,
          autoHideMenuBar: true,
          webPreferences: {
            session: contents.session,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
          },
        },
      };
    }
    if (kind === 'external') void openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  contents.on('did-create-window', (popup) => {
    popups.set(popup.id, { win: popup, profileId });
    secureRemote(popup.webContents, profileId, ownerId);
    popup.once('closed', () => popups.delete(popup.id));
    popup.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        const entry = windows.get(ownerId);
        if (entry) {
          entry.notice =
            'The sign-in page could not load. Some identity providers restrict embedded browsers. Try another supported sign-in method.';
          changed();
        }
      }
    });
  });
}
function homeFor(id: string): string {
  const saved = store.settings.lastLocations[id];
  return saved && urlKind(saved, fixture) === 'content' ? saved : fixture ? `${fixture}/` : HOME;
}
function attachView(entry: WindowEntry): void {
  entry.typography?.dispose();
  entry.fontSize = 16;
  const view = new WebContentsView({
    webPreferences: {
      session: configureSession(entry.profileId),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  entry.view = view;
  entry.error = null;
  entry.loading = true;
  entry.win.contentView.addChildView(view);
  resize(entry);
  const contents = view.webContents;
  contents.setZoomFactor(store.settings.zoom);
  secureRemote(contents, entry.profileId, entry.win.id);
  entry.typography = new ChatTypography(
    contents,
    entry.win.webContents,
    () => !contents.isDestroyed() && urlKind(contents.getURL(), fixture) === 'content',
    (fontSize) => {
      if (entry.win.isDestroyed() || entry.view.webContents !== contents) return;
      entry.fontSize = fontSize;
      resize(entry);
      changed();
    },
  );
  contents.on('did-start-loading', () => {
    entry.loading = true;
    changed();
  });
  contents.on('did-stop-loading', () => {
    entry.loading = false;
    changed();
  });
  contents.on('page-title-updated', (_event, title) => {
    entry.title = title.slice(0, 200);
    changed();
  });
  const location = (): void => {
    const raw = contents.getURL();
    if (urlKind(raw, fixture) === 'content') {
      const url = new URL(raw);
      url.search = '';
      url.hash = '';
      store.settings.lastLocations[entry.profileId] = url.href;
      store.changed();
    }
    entry.error = null;
    changed();
  };
  contents.on('did-navigate', location);
  contents.on('did-navigate-in-page', location);
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      entry.error = `The page could not load (network code ${code}). Check your connection and retry. Some sign-in providers restrict embedded browsers.`;
      entry.loading = false;
      changed();
    }
  });
  contents.on('render-process-gone', () => {
    entry.error = 'The website renderer stopped. Reload to recover this window.';
    entry.loading = false;
    changed();
  });
  void contents.loadURL(homeFor(entry.profileId)).catch(() => {
    /* did-fail-load provides a safe user-facing error. */
  });
}
function resize(entry: WindowEntry): void {
  const [width, height] = entry.win.getContentSize();
  const top = toolbarHeight(entry.fontSize);
  entry.view?.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
}
async function createWindow(profileId = store.settings.defaultProfileId): Promise<WindowEntry> {
  requireProfile(profileId);
  const saved = store.settings.bounds;
  const area = saved
    ? screen.getDisplayMatching(saved).workArea
    : screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    ...clampBounds(saved, area),
    minWidth: 720,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#fcfcfc',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  const entry = {
    win,
    profileId,
    panel: 'none',
    loading: true,
    error: null,
    notice: store.recovered
      ? 'Settings were recovered. Your browser profile folders have not been deleted.'
      : null,
    title: 'ChatGPT',
    fontSize: 16,
  } as WindowEntry;
  windows.set(win.id, entry);
  attachView(entry);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('did-finish-load', () => emit(entry));
  win.on('resize', () => {
    resize(entry);
    saveWindow(entry);
  });
  win.on('move', () => saveWindow(entry));
  win.on('maximize', () => saveWindow(entry));
  win.on('unmaximize', () => saveWindow(entry));
  win.on('close', () => {
    if (downloads.hasActive(undefined, win.id)) win.contentView.removeChildView(entry.view);
  });
  win.on('closed', () => {
    entry.typography?.dispose();
    windows.delete(win.id);
    for (const popup of popups.values())
      if (owners.get(popup.win.webContents.id) === win.id) popup.win.close();
    if (!entry.view.webContents.isDestroyed()) {
      if (downloads.hasActive(undefined, win.id)) retired.set(win.id, entry.view);
      else entry.view.webContents.close();
    }
    changed();
  });
  win.once('ready-to-show', () => {
    if (store.settings.maximized) win.maximize();
    win.show();
  });
  if (devOrigin) await win.loadURL(devOrigin);
  else await win.loadURL(`${uiOrigin}/index.html`);
  return entry;
}
function saveWindow(entry: WindowEntry): void {
  if (entry.win.isDestroyed()) return;
  store.settings.bounds = entry.win.getNormalBounds();
  store.settings.maximized = entry.win.isMaximized();
  store.changed();
}
function localSender(event: IpcMainInvokeEvent): WindowEntry | undefined {
  const entry = [...windows.values()].find((item) => item.win.webContents === event.sender);
  if (!entry || event.senderFrame !== event.sender.mainFrame) return;
  try {
    const url = new URL(event.senderFrame.url);
    if (
      devOrigin
        ? url.origin !== new URL(devOrigin).origin
        : url.protocol !== 'dock:' || url.hostname !== 'ui' || url.pathname !== '/index.html'
    )
      return;
  } catch {
    return;
  }
  return entry;
}
async function execute(entry: WindowEntry, command: Command): Promise<unknown> {
  const contents = entry.view.webContents;
  switch (command.type) {
    case 'snapshot':
      emit(entry);
      break;
    case 'panel':
      entry.panel = command.panel;
      break;
    case 'new-window':
      await createWindow(command.profileId ?? entry.profileId);
      break;
    case 'profile-create': {
      if (store.settings.profiles.length >= 30) throw new Error('You can save up to 30 profiles.');
      const profile = { id: randomUUID(), name: command.name };
      store.settings.profiles.push(profile);
      store.changed();
      changed();
      return profile;
    }
    case 'profile-rename':
      requireProfile(command.id);
      store.settings.profiles.find((p) => p.id === command.id)!.name = command.name;
      store.changed();
      break;
    case 'profile-default':
      requireProfile(command.id);
      store.settings.defaultProfileId = command.id;
      store.changed();
      break;
    case 'profile-delete': {
      requireProfile(command.id);
      if (store.settings.profiles.length === 1) throw new Error('Keep at least one profile.');
      if (
        [...windows.values()].some((w) => w.profileId === command.id) ||
        [...popups.values()].some((p) => p.profileId === command.id) ||
        downloads.hasActive(command.id)
      )
        throw new Error(
          'Close all windows and finish downloads using this profile before deleting it.',
        );
      const answer = await dialog.showMessageBox(entry.win, {
        type: 'warning',
        buttons: ['Cancel', 'Delete profile'],
        defaultId: 0,
        cancelId: 0,
        message: 'Delete this profile and its website login data?',
        detail: 'Other profiles are not affected. Downloaded files are kept.',
      });
      if (answer.response !== 1) break;
      // Revalidate after the asynchronous confirmation, since other windows can open meanwhile.
      if (
        [...windows.values()].some((w) => w.profileId === command.id) ||
        [...popups.values()].some((p) => p.profileId === command.id) ||
        downloads.hasActive(command.id)
      )
        throw new Error('This profile is now in use. Close its windows first.');
      const ses = configureSession(command.id);
      deletingProfiles.add(command.id);
      try {
        await ses.clearStorageData();
        await ses.clearCache();
        await ses.cookies.flushStore();
        store.settings.profiles = store.settings.profiles.filter((p) => p.id !== command.id);
        delete store.settings.lastLocations[command.id];
        if (store.settings.defaultProfileId === command.id)
          store.settings.defaultProfileId = store.settings.profiles[0].id;
        await store.flush();
      } finally {
        deletingProfiles.delete(command.id);
      }
      break;
    }
    case 'profile-switch': {
      requireProfile(command.id);
      if (entry.profileId === command.id) break;
      if (downloads.hasActive(undefined, entry.win.id))
        throw new Error('Finish this window’s downloads before switching profiles.');
      for (const popup of popups.values())
        if (owners.get(popup.win.webContents.id) === entry.win.id) popup.win.close();
      entry.win.contentView.removeChildView(entry.view);
      entry.view.webContents.close();
      entry.profileId = command.id;
      entry.panel = 'none';
      attachView(entry);
      break;
    }
    case 'navigate': {
      switch (command.action) {
        case 'back':
          if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
          break;
        case 'forward':
          if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
          break;
        case 'reload':
          entry.error = null;
          if (contents.getURL()) contents.reload();
          else void contents.loadURL(homeFor(entry.profileId)).catch(() => {});
          break;
        case 'home':
          entry.error = null;
          void contents.loadURL(fixture ? `${fixture}/` : HOME).catch(() => {});
          break;
        case 'external':
          await openExternal(contents.getURL());
          break;
        default: {
          const delta = command.action === 'zoom-in' ? 0.1 : -0.1;
          const factor =
            command.action === 'zoom-reset'
              ? 1
              : Math.max(0.5, Math.min(2, contents.getZoomFactor() + delta));
          for (const item of windows.values()) {
            item.view.webContents.setZoomFactor(factor);
            item.typography?.refreshScale();
          }
          store.settings.zoom = factor;
          store.changed();
          break;
        }
      }
      break;
    }
    case 'settings': {
      if (command.theme) {
        store.settings.theme = command.theme;
        nativeTheme.themeSource = command.theme;
      }
      if (command.askDownload !== undefined) store.settings.askDownload = command.askDownload;
      store.changed();
      break;
    }
    case 'directory': {
      const result = await dialog.showOpenDialog(entry.win, {
        title: 'Choose download folder',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: store.settings.downloadDirectory,
      });
      if (!result.canceled && result.filePaths[0]) {
        await access(result.filePaths[0]);
        store.settings.downloadDirectory = result.filePaths[0];
        store.changed();
      }
      break;
    }
    case 'download':
      await downloads.action(command.id, command.action);
      break;
    case 'clear-downloads':
      downloads.clear();
      break;
    case 'diagnostics':
      return app.getAppMetrics().map((metric) => ({
        pid: metric.pid,
        type: metric.type,
        cpu: metric.cpu.percentCPUUsage,
        workingSetKB: metric.memory.workingSetSize,
      }));
    case 'updates':
      await updates.check();
      break;
    case 'update-token':
      await updates.saveToken(command.token);
      break;
  }
  changed();
}
function setupMenu(): void {
  const action = (command: Command): void => {
    const entry = focused();
    if (entry)
      void execute(entry, command).catch((error) => {
        entry.notice = error instanceof Error ? error.message : 'Action failed.';
        changed();
      });
  };
  const nav = (name: string): void =>
    action({ type: 'navigate', action: name as Extract<Command, { type: 'navigate' }>['action'] });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: app.name,
              submenu: [
                {
                  label: 'About ChattyDock',
                  click: () => action({ type: 'panel', panel: 'about' }),
                },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: 'File',
        submenu: [
          {
            label: 'New Window…',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              if (focused()) action({ type: 'panel', panel: 'new' });
              else void createWindow();
            },
          },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => action({ type: 'panel', panel: 'settings' }),
          },
          {
            label: 'Manage Profiles',
            click: () => action({ type: 'panel', panel: 'profiles' }),
          },
          {
            label: 'Downloads',
            accelerator: 'CmdOrCtrl+J',
            click: () => action({ type: 'panel', panel: 'downloads' }),
          },
          { role: 'close' },
          ...(process.platform === 'darwin' ? [] : [{ role: 'quit' as const }]),
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { label: 'Reload Website', accelerator: 'CmdOrCtrl+R', click: () => nav('reload') },
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => nav('zoom-in') },
          { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => nav('zoom-out') },
          { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => nav('zoom-reset') },
          {
            label: 'Back',
            accelerator: process.platform === 'darwin' ? 'Cmd+[' : 'Alt+Left',
            click: () => nav('back'),
          },
          {
            label: 'Forward',
            accelerator: process.platform === 'darwin' ? 'Cmd+]' : 'Alt+Right',
            click: () => nav('forward'),
          },
          { label: 'Open in Browser', click: () => nav('external') },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
      {
        label: 'Help',
        submenu: [
          { label: 'About ChattyDock', click: () => action({ type: 'panel', panel: 'about' }) },
          { label: 'Check for Updates', click: () => action({ type: 'updates' }) },
        ],
      },
    ]),
  );
}
app.on('second-instance', () => {
  if (store) void createWindow(focused()?.profileId).catch(() => {});
});
app.on('activate', () => {
  if (store && !windows.size) void createWindow().catch(() => {});
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !downloads?.hasActive()) app.quit();
});
app.on('before-quit', (event) => {
  if (flushComplete) return;
  event.preventDefault();
  if (quitting || quitPending) return;
  quitPending = true;
  const finish = async (): Promise<void> => {
    if (downloads?.hasActive()) {
      const answer = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Keep downloading', 'Cancel downloads and quit'],
        defaultId: 0,
        cancelId: 0,
        message: 'Downloads are still running.',
        detail:
          'Closing a window keeps its downloads running. Quitting the app cancels them; they cannot resume after restart.',
      });
      if (answer.response !== 1) {
        quitPending = false;
        return;
      }
    }
    quitting = true;
    downloads?.cancelAll();
    try {
      if (store) await store.flush();
      if (downloads) await downloads.flush();
    } catch {
      /* Shutdown must remain possible if the disk is unavailable. */
    }
    flushComplete = true;
    app.quit();
  };
  void finish();
});
if (locked)
  void app
    .whenReady()
    .then(async () => {
      await protocol.handle('dock', async (request) => {
        const url = new URL(request.url);
        const filename = path.resolve(uiPath, `.${decodeURIComponent(url.pathname)}`);
        if (url.hostname !== 'ui' || !filename.startsWith(`${uiPath}${path.sep}`))
          return new Response('Not found', { status: 404 });
        return net.fetch(pathToFileURL(filename).href);
      });
      store = new Store(app.getPath('userData'), app.getPath('downloads'));
      await store.load();
      store.settings.lastAppVersion = app.getVersion();
      await store.flush();
      await mkdir(store.settings.downloadDirectory, { recursive: true }).catch(() => {});
      nativeTheme.themeSource = store.settings.theme;
      downloads = new Downloads(store, (contents) => owners.get(contents.id) ?? -1, changed);
      await downloads.load();
      updates = new Updates(
        () => {
          if (updateShutdown && updates?.state.stage === 'error') {
            quitting = false;
            flushComplete = false;
            updateShutdown = false;
          }
          changed();
        },
        () => !quitting && !quitPending && !downloads.hasActive(),
        async () => {
          await store.flush();
          await downloads.flush();
          for (const ses of configured) {
            ses.flushStorageData();
            await ses.cookies.flushStore();
          }
          quitting = true;
          flushComplete = true;
          updateShutdown = true;
        },
        testMode,
        updateE2e && process.argv.includes('--dock-update-test')
          ? process.env.DOCK_UPDATE_E2E_FEED
          : undefined,
      );
      ipcMain.handle('dock:command', async (event, raw: unknown) => {
        const entry = localSender(event);
        if (!entry) return { ok: false, error: 'Untrusted IPC sender.' };
        const parsed = commandSchema.safeParse(raw);
        if (!parsed.success) return { ok: false, error: 'Invalid command.' };
        try {
          return { ok: true, value: await execute(entry, parsed.data) };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'The action could not be completed.',
          };
        }
      });
      setupMenu();
      await createWindow();
      const updateTimer = setTimeout(() => {
        void updates.check().catch(() => {});
      }, 1500);
      updateTimer.unref();
    })
    .catch(() => {
      dialog.showErrorBox(
        'ChattyDock',
        'The application could not start. Check that its data directory is writable and try again.',
      );
      app.exit(1);
    });
