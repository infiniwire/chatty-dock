import { expect, it } from 'vitest';
import { surfaceCookieHeader } from '../src/main/window-surface';
import { WindowSurface } from '../src/main/window-surface';
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';

it('replaces only the UI surface cookie and preserves authentication values', () => {
  expect(
    surfaceCookieHeader(
      'session=opaque==; codex_app_mode=STEPS_PROSE; csrf=token; theme=dark',
      'STEPS_EXECUTION',
    ),
  ).toBe('session=opaque==; csrf=token; theme=dark; codex_app_mode=STEPS_EXECUTION');
  expect(
    surfaceCookieHeader('session=opaque==; codex_app_mode=STEPS_PROSE; csrf=token', null),
  ).toBe('session=opaque==; csrf=token');
  expect(surfaceCookieHeader('', 'STEPS_PROSE')).toBe('codex_app_mode=STEPS_PROSE');
  expect(
    surfaceCookieHeader('codex_app_mode=STEPS_PROSE;codex_app_mode=STEPS_COMMANDS', null),
  ).toBe('');
});

it('accepts only the owning content frame and a finite non-secret mode value', () => {
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: { url: 'https://chatgpt.com/' },
  });
  const surface = new WindowSurface();
  surface.attach(contents as unknown as WebContents, (url) =>
    url.startsWith('https://chatgpt.com/'),
  );
  contents.emit('console-message', {
    frame: { url: 'https://chatgpt.com/' },
    message: `${surface.prefix}STEPS_EXECUTION`,
  });
  expect(surface.value).toBeUndefined();
  contents.emit('console-message', {
    frame: contents.mainFrame,
    message: `${surface.prefix}not-a-mode`,
  });
  expect(surface.value).toBeUndefined();
  contents.emit('console-message', {
    frame: contents.mainFrame,
    message: `${surface.prefix}STEPS_EXECUTION`,
  });
  expect(surface.value).toBe('STEPS_EXECUTION');
  contents.mainFrame.url = 'https://accounts.google.com/';
  contents.emit('console-message', {
    frame: contents.mainFrame,
    message: `${surface.prefix}STEPS_PROSE`,
  });
  expect(surface.value).toBe('STEPS_EXECUTION');
  contents.mainFrame.url = 'https://chatgpt.com/';
  contents.emit('console-message', { frame: contents.mainFrame, message: `${surface.prefix}null` });
  expect(surface.value).toBeNull();
  contents.emit('destroyed');
  expect(contents.listenerCount('console-message')).toBe(0);
  expect(surface.value).toBeUndefined();
});
