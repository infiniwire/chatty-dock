import { describe, expect, it } from 'vitest';
import { MediaPermissions } from '../src/main/media-permissions';

describe('session media permissions', () => {
  it('keeps approvals scoped to profile, exact origin, media type and runtime', () => {
    const first = new MediaPermissions();
    const otherProfile = new MediaPermissions();
    const origin = first.origin('https://chatgpt.com/c/one', 'https://chatgpt.com/', true);
    expect(origin).toBe('https://chatgpt.com');
    first.remember(origin!, ['audio']);
    expect(first.has(origin!, ['audio'])).toBe(true);
    expect(first.has(origin!, ['video'])).toBe(false);
    expect(first.has(origin!, ['audio', 'video'])).toBe(false);
    expect(first.has('https://www.chatgpt.com', ['audio'])).toBe(false);
    expect(otherProfile.has(origin!, ['audio'])).toBe(false);
    expect(new MediaPermissions().has(origin!, ['audio'])).toBe(false);
    first.remember(origin!, ['video']);
    expect(first.has(origin!, ['audio', 'video'])).toBe(true);
  });
  it('rejects cross-origin frames, authentication pages, malformed and ambiguous types', () => {
    const permissions = new MediaPermissions('http://127.0.0.1:1234');
    expect(
      permissions.origin('https://chatgpt.com/', 'https://chatgpt.com/', false),
    ).toBeUndefined();
    expect(
      permissions.origin('https://www.chatgpt.com/', 'https://chatgpt.com/', true),
    ).toBeUndefined();
    expect(
      permissions.origin('https://auth.openai.com/', 'https://auth.openai.com/', true),
    ).toBeUndefined();
    expect(
      permissions.origin('https://chatgpt.com.evil.test/', 'https://chatgpt.com/', true),
    ).toBeUndefined();
    expect(permissions.origin('bad', 'https://chatgpt.com/', true)).toBeUndefined();
    expect(permissions.origin('http://127.0.0.1:1234/', 'http://127.0.0.1:1234/', true)).toBe(
      'http://127.0.0.1:1234',
    );
    for (const value of [undefined, [], ['unknown'], ['audio', 'screen']]) {
      const types = permissions.types(value);
      expect(types).toEqual([]);
      expect(permissions.has('https://chatgpt.com', types)).toBe(false);
    }
    expect(permissions.types(['audio', 'audio', 'video'])).toEqual(['audio', 'video']);
  });
});
