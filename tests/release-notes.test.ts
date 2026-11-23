import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const notes = (version: string): string =>
  execFileSync(process.execPath, ['scripts/release-notes.mjs', version], {
    encoding: 'utf8',
  });

describe('release notes', () => {
  it('includes only the requested version changes', () => {
    const output = notes('0.3.4');
    expect(output).toContain('Add a website zoom slider');
    expect(output).not.toContain('Recheck active file downloads');
  });

  it('supports routine releases without a changelog section', () => {
    expect(notes('9999.0.0')).toContain('Routine maintenance and compatibility checks.');
  });
});
