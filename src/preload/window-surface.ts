// This function is serialized into the page world. Keep it self-contained and
// expose no Node, Electron, cookie-reading or privileged command bridge.
export function installWindowSurface(cookieName: string, storageKey: string, prefix: string): void {
  const modes = new Set(['STEPS_PROSE', 'STEPS_COMMANDS', 'STEPS_EXECUTION']);
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!descriptor?.get || !descriptor.set) return;
  const nativeGet = descriptor.get;
  const nativeSet = descriptor.set;
  const notify = console.debug.bind(console);
  const nativeMode = (): string | null => {
    const pair = (nativeGet.call(document) as string)
      .split(';')
      .find((part) => part.trim().startsWith(`${cookieName}=`));
    if (!pair) return null;
    try {
      const value = decodeURIComponent(pair.trim().slice(cookieName.length + 1));
      return modes.has(value) ? value : null;
    } catch {
      return null;
    }
  };
  let mode: string | null = nativeMode();
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved);
      if (parsed === null || (typeof parsed === 'string' && modes.has(parsed))) mode = parsed;
    }
  } catch {
    /* Cookie fallback still keeps this document independent. */
  }
  const publish = (): void => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(mode));
    } catch {
      /* Optional browser storage. */
    }
    // Only a finite, non-secret UI enum is emitted. Never emit native cookies.
    notify(prefix + (mode ?? 'null'));
  };
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() {
      const cookies = (nativeGet.call(document) as string)
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part && part.split('=', 1)[0] !== cookieName);
      if (mode !== null) cookies.push(`${cookieName}=${mode}`);
      return cookies.join('; ');
    },
    set(raw: unknown) {
      const text = String(raw);
      nativeSet.call(document, text);
      if (text.split(';', 1)[0].split('=', 1)[0].trim() === cookieName) {
        mode = nativeMode();
        publish();
      }
    },
  });
  publish();
}
