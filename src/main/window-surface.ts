import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';

export const surfaceCookie = 'codex_app_mode';
const modes = ['STEPS_PROSE', 'STEPS_COMMANDS', 'STEPS_EXECUTION'] as const;
type SurfaceMode = (typeof modes)[number] | null;

// Only the non-authentication app-mode preference is replaced. Authentication
// cookie values and all other headers remain untouched.
export function surfaceCookieHeader(header: string, mode: SurfaceMode): string {
  const cookies = header
    .split(';')
    .filter((part) => part.trim().split('=', 1)[0] !== surfaceCookie);
  if (mode !== null) cookies.push(` ${surfaceCookie}=${mode}`);
  return cookies
    .map((part) => part.trim())
    .filter(Boolean)
    .join('; ');
}

export class WindowSurface {
  readonly prefix = `chattydock-surface-${randomUUID()}:`;
  value: SurfaceMode | undefined;
  private contents?: WebContents;
  private allowed?: (url: string) => boolean;
  arguments(fixture?: string): string[] {
    return [
      `--chattydock-surface-prefix=${this.prefix}`,
      ...(fixture ? [`--chattydock-surface-origin=${fixture}`] : []),
    ];
  }
  attach(contents: WebContents, allowed: (url: string) => boolean): void {
    this.contents = contents;
    this.allowed = allowed;
    contents.on('console-message', this.message);
    contents.once('destroyed', this.dispose);
  }
  private message = (
    event: Electron.Event<Electron.WebContentsConsoleMessageEventParams>,
  ): void => {
    if (
      !this.contents ||
      event.frame !== this.contents.mainFrame ||
      !this.allowed?.(event.frame.url) ||
      !event.message.startsWith(this.prefix)
    )
      return;
    const raw = event.message.slice(this.prefix.length);
    if (raw === 'null') this.value = null;
    else if (modes.includes(raw as (typeof modes)[number])) this.value = raw as SurfaceMode;
  };
  dispose = (): void => {
    this.contents?.off('console-message', this.message);
    this.contents = undefined;
    this.allowed = undefined;
    this.value = undefined;
  };
}
