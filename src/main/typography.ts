import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';

export function toolbarHeight(fontSize: number): number {
  return Math.max(55, Math.ceil(fontSize * 1.25 + 35));
}

// Runs in a separate JavaScript world with no Node/IPC bridge. Only a bounded
// computed font size is reported; no message text or page styles are changed.
const observe = String.raw`(() => {
  globalThis.__dockTypography?.dispose();
  const prefix = PREFIX;
  let timer, target, previous;
  const selectors = [
    '[data-message-author-role="assistant"] .markdown p',
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"]',
    'main .markdown p', 'main .markdown', '#prompt-textarea',
    '[contenteditable="true"][role="textbox"]', 'main textarea', 'main', 'body'
  ];
  function schedule() {
    if (timer === undefined) timer = setTimeout(sample, 200);
  }
  const sizeObserver = new ResizeObserver(schedule);
  function sample() {
    timer = undefined;
    let element;
    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (candidate?.getClientRects().length) { element = candidate; break; }
    }
    if (!element) return;
    if (element !== target) {
      sizeObserver.disconnect(); target = element; sizeObserver.observe(element);
    }
    const size = parseFloat(getComputedStyle(element).fontSize);
    if (Number.isFinite(size) && size >= 8 && size <= 64 && size !== previous) {
      previous = size;
      console.debug(prefix + size);
    }
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style']
  });
  addEventListener('resize', schedule);
  document.addEventListener('load', schedule, true);
  document.fonts.addEventListener('loadingdone', schedule);
  globalThis.__dockTypography = {
    refresh: schedule,
    dispose() {
      clearTimeout(timer); observer.disconnect(); sizeObserver.disconnect();
      removeEventListener('resize', schedule);
      document.removeEventListener('load', schedule, true);
      document.fonts.removeEventListener('loadingdone', schedule);
      delete globalThis.__dockTypography;
    }
  };
  sample();
})()`;
const world = 1001;

export class ChatTypography {
  private readonly prefix = `dock-font-${randomUUID()}:`;
  private baseSize = 16;
  private previous = 0;
  private disposed = false;
  constructor(
    private readonly remote: WebContents,
    private readonly local: WebContents,
    private readonly allowed: () => boolean,
    private readonly changed: (fontSize: number) => void,
  ) {
    remote.on('console-message', this.message);
    remote.on('dom-ready', this.install);
    remote.on('did-navigate-in-page', this.refresh);
    remote.once('destroyed', this.dispose);
  }
  refreshScale = (): void => {
    if (this.disposed || this.remote.isDestroyed() || this.local.isDestroyed() || !this.allowed())
      return;
    const size =
      Math.round(
        Math.max(
          8,
          Math.min(128, (this.baseSize * this.remote.getZoomFactor()) / this.local.getZoomFactor()),
        ) * 100,
      ) / 100;
    if (size !== this.previous) {
      this.previous = size;
      this.changed(size);
    }
  };
  private message = (
    event: Electron.Event<Electron.WebContentsConsoleMessageEventParams>,
  ): void => {
    if (
      this.disposed ||
      !event.message.startsWith(this.prefix) ||
      !this.allowed() ||
      event.frame !== this.remote.mainFrame
    )
      return;
    const size = Number(event.message.slice(this.prefix.length));
    if (!Number.isFinite(size) || size < 8 || size > 64) return;
    this.baseSize = size;
    this.refreshScale();
  };
  private run(code: string): Promise<unknown> {
    if (this.remote.isDestroyed()) return Promise.resolve();
    return this.remote.executeJavaScriptInIsolatedWorld(world, [{ code }]).catch(() => {});
  }
  private install = (): void => {
    if (this.disposed || !this.allowed()) return;
    void this.run(observe.replace('PREFIX', JSON.stringify(this.prefix))).then(() => {
      if (this.disposed) void this.run('globalThis.__dockTypography?.dispose()');
    });
  };
  private refresh = (): void => {
    if (!this.disposed && this.allowed()) void this.run('globalThis.__dockTypography?.refresh()');
  };
  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.remote.off('console-message', this.message);
    this.remote.off('dom-ready', this.install);
    this.remote.off('did-navigate-in-page', this.refresh);
    this.remote.off('destroyed', this.dispose);
    void this.run('globalThis.__dockTypography?.dispose()');
  };
}
