import path from 'node:path';

export const HOME = 'https://chatgpt.com/';
const contentHosts = new Set(['chatgpt.com', 'www.chatgpt.com']);
const authHosts = new Set([
  'auth.openai.com',
  'auth0.openai.com',
  'accounts.google.com',
  'appleid.apple.com',
  'account.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
]);
export function urlKind(
  raw: string,
  fixtureOrigin?: string,
): 'content' | 'auth' | 'external' | 'blocked' {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return 'blocked';
    if (fixtureOrigin && url.origin === fixtureOrigin) return 'content';
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'blocked';
    if (url.protocol === 'http:') return 'external';
    if (url.port && url.port !== '443') return 'external';
    if (contentHosts.has(url.hostname)) return 'content';
    if (authHosts.has(url.hostname)) return 'auth';
    return 'external';
  } catch {
    return 'blocked';
  }
}
export function isEmbeddedURL(raw: string, fixtureOrigin?: string): boolean {
  const kind = urlKind(raw, fixtureOrigin);
  return kind === 'content' || kind === 'auth';
}
export function safeFilename(input: string): string {
  // Control characters must be removed from untrusted cross-platform filenames.
  // eslint-disable-next-line no-control-regex
  const unsafeCharacters = /[<>:"/\\|?*\u0000-\u001f]/g;
  let value = path.win32
    .basename(input)
    .replace(unsafeCharacters, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);
  if (!value || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(value))
    value = `download-${value || 'file'}`;
  return value;
}
export function uniqueDownloadPath(directory: string, filename: string, id: string): string {
  if (!path.isAbsolute(directory)) throw new Error('Download directory must be absolute.');
  const safe = safeFilename(filename);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  return path.join(directory, `${stem}-${id}${ext}`);
}
export function clampBounds(
  bounds: Electron.Rectangle | undefined,
  area: Electron.Rectangle,
): Electron.Rectangle {
  const width = Math.min(bounds?.width ?? 1200, area.width);
  const height = Math.min(bounds?.height ?? 850, area.height);
  return {
    width,
    height,
    x: Math.max(
      area.x,
      Math.min(bounds?.x ?? area.x + (area.width - width) / 2, area.x + area.width - width),
    ),
    y: Math.max(
      area.y,
      Math.min(bounds?.y ?? area.y + (area.height - height) / 2, area.y + area.height - height),
    ),
  };
}
