import { contextBridge } from 'electron';
import { installWindowSurface } from './window-surface';

const prefix = process.argv
  .find((arg) => arg.startsWith('--chattydock-surface-prefix='))
  ?.slice('--chattydock-surface-prefix='.length);
const fixture = process.argv
  .find((arg) => arg.startsWith('--chattydock-surface-origin='))
  ?.slice('--chattydock-surface-origin='.length);
const origins = ['https://chatgpt.com', 'https://www.chatgpt.com'];
if (fixture && /^http:\/\/127\.0\.0\.1:\d+$/.test(fixture)) origins.push(fixture);
if (prefix && origins.includes(location.origin)) {
  contextBridge.executeInMainWorld({
    func: installWindowSurface,
    args: ['codex_app_mode', 'chattydock/window/surface/v1', prefix],
  });
}
