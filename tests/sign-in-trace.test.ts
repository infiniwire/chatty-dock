import { expect, it } from 'vitest';
import { SignInTrace } from '../src/main/sign-in-trace';

it('records only opted-in origins and routing decisions, never authorization data', () => {
  const trace = new SignInTrace();
  const from = 'https://accounts.google.com/signin/private-person?token=PRIVATE_QUERY#PRIVATE_HASH';
  const to = 'https://user:PRIVATE_PASSWORD@handoff.example/PRIVATE_PATH?code=PRIVATE_CODE';
  trace.record('redirect', from, to, 'browser');
  expect(trace.count).toBe(0);
  trace.start(from);
  trace.record('redirect', from, to, 'browser', 'POST');
  trace.record('failed', from, 'data:text/html,PRIVATE_BODY', 'blocked', undefined, -105);
  const report = trace.report('0.2.2', 'win32');
  expect(report).not.toMatch(/PRIVATE_|private-person|signin\/|user:|data:text/);
  expect(JSON.parse(report).events).toEqual([
    {
      event: 'start',
      from: 'https://accounts.google.com',
      to: 'https://accounts.google.com',
      kind: 'auth',
      action: 'embedded',
    },
    {
      event: 'redirect',
      from: 'https://accounts.google.com',
      to: 'https://handoff.example',
      kind: 'blocked',
      action: 'browser',
      method: 'POST',
    },
    {
      event: 'failed',
      from: 'https://accounts.google.com',
      to: null,
      kind: 'blocked',
      action: 'blocked',
      code: -105,
    },
  ]);
  trace.stop();
  trace.record('popup', from, 'https://other.example', 'browser');
  expect(trace.count).toBe(3);
  trace.clear();
  expect(trace.count).toBe(0);
  expect(trace.recording).toBe(false);
});

it('bounds the in-memory report and clears the previous attempt on restart', () => {
  const trace = new SignInTrace();
  trace.start('https://chatgpt.com');
  for (let i = 0; i < 100; i++)
    trace.record('request', '', `https://example.com/${i}`, 'browser', 'PATCH');
  expect(trace.count).toBe(64);
  expect(
    JSON.parse(trace.report('0.2.2', 'darwin')).events.every(
      (item: { method: string }) => item.method === 'OTHER',
    ),
  ).toBe(true);
  trace.start('https://chatgpt.com');
  expect(trace.count).toBe(1);
});
