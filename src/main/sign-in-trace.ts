import { urlKind } from './policy';

type TraceEvent =
  | 'start'
  | 'request'
  | 'navigation'
  | 'redirect'
  | 'popup'
  | 'committed'
  | 'failed'
  | 'manual-browser';
type TraceAction = 'embedded' | 'browser' | 'blocked';
type Entry = {
  event: TraceEvent;
  from: string | null;
  to: string | null;
  kind: ReturnType<typeof urlKind>;
  action: TraceAction;
  method?: 'GET' | 'POST' | 'OTHER';
  code?: number;
};

function origin(raw: string): string | null {
  try {
    const url = new URL(raw);
    // Paths, query strings, fragments and URL credentials never enter the report.
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export class SignInTrace {
  recording = false;
  private entries: Entry[] = [];
  get count(): number {
    return this.entries.length;
  }
  start(current: string): void {
    this.entries = [];
    this.recording = true;
    this.record('start', current, current, 'embedded');
  }
  stop(): void {
    this.recording = false;
  }
  clear(): void {
    this.stop();
    this.entries = [];
  }
  record(
    event: TraceEvent,
    from: string,
    to: string,
    action: TraceAction,
    method?: string,
    code?: number,
  ): void {
    if (!this.recording) return;
    this.entries.push({
      event,
      from: origin(from),
      to: origin(to),
      kind: urlKind(to),
      action,
      ...(method ? { method: method === 'GET' || method === 'POST' ? method : 'OTHER' } : {}),
      ...(Number.isInteger(code) ? { code } : {}),
    });
    this.entries = this.entries.slice(-64);
  }
  report(version: string, platform: string): string {
    return JSON.stringify(
      { version, platform, recording: this.recording, events: this.entries },
      null,
      2,
    );
  }
}
