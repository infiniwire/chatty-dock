import { describe, it, expect } from 'vitest';
import {
  urlKind,
  isEmbeddedURL,
  safeFilename,
  uniqueDownloadPath,
  clampBounds,
} from '../src/main/policy';
import { commandSchema } from '../src/shared/model';
import os from 'node:os';

describe('navigation boundaries', () => {
  it('allows exact content and authentication hosts', () => {
    expect(urlKind('https://chatgpt.com/c/123')).toBe('content');
    expect(urlKind('https://accounts.google.com/signin')).toBe('auth');
    expect(urlKind('https://chatgpt.com.attacker.example/')).toBe('external');
    expect(urlKind('https://chatgpt.com:8443/')).toBe('external');
    expect(urlKind('https://chatgpt.com@attacker.example/')).toBe('blocked');
  });
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,hi',
    'https://user:password@chatgpt.com/',
    'http://user:password@x.com/',
    'ms-settings:privacy',
    'bad url',
    'mailto:a@b.com',
  ])('blocks unsafe URL %s', (raw) => expect(urlKind(raw)).toBe('blocked'));
  it('only allows the explicit test fixture origin', () => {
    expect(urlKind('http://127.0.0.1:1234/test', 'http://127.0.0.1:1234')).toBe('content');
    expect(urlKind('http://127.0.0.1:1235/test', 'http://127.0.0.1:1234')).toBe('external');
    expect(urlKind('http://user@127.0.0.1:1234/test', 'http://127.0.0.1:1234')).toBe('blocked');
  });
  it.each([
    'https://twitter.com/home',
    'https://x.com/home',
    'http://example.com/',
    'http://chatgpt.com/',
    'https://chatgpt.com.attacker.example/',
    'https://accounts.google.com.attacker.example/',
    'https://chatgpt.com:8443/',
    'https://chatgpt.com./',
  ])('routes %s outside the container', (raw) => {
    expect(urlKind(raw)).toBe('external');
    expect(isEmbeddedURL(raw)).toBe(false);
  });
  it('retains exact HTTPS content and sign-in hosts inside the sandbox', () => {
    expect(isEmbeddedURL('https://CHATGPT.COM/c/123')).toBe(true);
    expect(isEmbeddedURL('https://auth.openai.com/authorize')).toBe(true);
    expect(isEmbeddedURL('https://accounts.google.com/signin')).toBe(true);
    expect(isEmbeddedURL('javascript:alert(1)')).toBe(false);
  });
  it('keeps the Google consent endpoint embedded without admitting lookalike domains', () => {
    expect(
      urlKind('https://accounts.google.com/signin/oauth/legacy/consent?synthetic=fixture'),
    ).toBe('auth');
    expect(isEmbeddedURL('https://accounts.google.com/signin/oauth/legacy/consent')).toBe(true);
    expect(
      isEmbeddedURL('https://accounts.google.com.attacker.example/signin/oauth/legacy/consent'),
    ).toBe(false);
  });
  it('retains the observed Google account bridge without allowing YouTube browsing', () => {
    expect(urlKind('https://accounts.youtube.com/accounts/SetSID?synthetic=fixture')).toBe('auth');
    expect(isEmbeddedURL('https://accounts.youtube.com/')).toBe(true);
    for (const raw of [
      'https://youtube.com/',
      'https://www.youtube.com/',
      'https://m.youtube.com/',
      'https://youtu.be/fixture',
      'https://accounts.youtube.com.attacker.example/',
      'https://accounts.youtube.com./',
      'https://accounts.youtube.com:8443/',
      'http://accounts.youtube.com/',
    ]) {
      expect(urlKind(raw)).toBe('external');
      expect(isEmbeddedURL(raw)).toBe(false);
    }
    expect(urlKind('https://user:password@accounts.youtube.com/')).toBe('blocked');
  });
});
describe('download destinations', () => {
  it.each(['../../evil.txt', 'C:\\tmp\\evil.txt', 'CON', 'bad?.txt'])('sanitizes %s', (name) => {
    expect(safeFilename(name)).not.toMatch(/[<>:"/\\|?*]/);
    expect(safeFilename(name)).not.toBe('CON');
  });
  it('gives same-name downloads distinct paths and rejects relative directories', () => {
    expect(uniqueDownloadPath(os.tmpdir(), 'same.txt', 'a')).not.toBe(
      uniqueDownloadPath(os.tmpdir(), 'same.txt', 'b'),
    );
    expect(() => uniqueDownloadPath('relative', 'x', 'id')).toThrow();
  });
});
it('restores disconnected-monitor windows inside the available display', () => {
  expect(
    clampBounds(
      { x: 5000, y: -2000, width: 2000, height: 1500 },
      { x: 0, y: 0, width: 1280, height: 720 },
    ),
  ).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
});
it('rejects malformed privileged commands', () => {
  expect(commandSchema.safeParse({ type: 'window-layout', layout: 'left' }).success).toBe(true);
  expect(
    commandSchema.safeParse({ type: 'window-layout', layout: 'arbitrary-bounds', x: 1 }).success,
  ).toBe(false);
  expect(
    commandSchema.safeParse({
      type: 'layout-menu',
      action: 'open',
      anchor: { x: 0, y: 0, width: 0, height: 32 },
    }).success,
  ).toBe(false);
  for (const invalid of [NaN, Infinity, 16001]) {
    expect(
      commandSchema.safeParse({
        type: 'profile-menu',
        action: 'open',
        anchor: { x: invalid, y: 0, width: 140, height: 34 },
      }).success,
    ).toBe(false);
  }
  expect(
    commandSchema.safeParse({ type: 'profile-menu', action: 'close', restoreFocus: true }).success,
  ).toBe(true);
  expect(
    commandSchema.safeParse({ type: 'project-page', page: 'https://example.com' }).success,
  ).toBe(false);
  expect(commandSchema.safeParse({ type: 'project-page', page: 'releases' }).success).toBe(true);
  expect(commandSchema.safeParse({ type: 'profile-switch', id: '../../profile' }).success).toBe(
    false,
  );
  expect(commandSchema.safeParse({ type: 'navigate', action: 'execute' }).success).toBe(false);
  expect(commandSchema.safeParse({ type: 'profile-create', name: '   ' }).success).toBe(false);
});
