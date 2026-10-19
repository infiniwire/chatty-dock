import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const run = promisify(execFile);
const script = path.resolve('scripts/release-assets.mjs');
it('generates verified update metadata for Windows and both Mac architectures without collisions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dock-manifest-'));
  try {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ version: '0.2.0' }));
    const output = path.join(directory, 'assets');
    await mkdir(output);
    const names = [
      'win-x64.exe',
      'mac-x64.dmg',
      'mac-x64.zip',
      'mac-arm64.dmg',
      'mac-arm64.zip',
    ].map((suffix) => `ChattyDock-0.2.0-${suffix}`);
    for (const name of names) await writeFile(path.join(output, name), `payload-${name}`);
    await run(process.execPath, [script, output], {
      cwd: directory,
      env: { ...process.env, GITHUB_REF_TYPE: 'branch' },
    });
    const win = JSON.parse(await readFile(path.join(output, 'latest.yml'), 'utf8'));
    const mac = JSON.parse(await readFile(path.join(output, 'latest-mac.yml'), 'utf8'));
    expect(win.files).toHaveLength(1);
    expect(mac.files).toHaveLength(4);
    expect(mac.files.filter((file: { url: string }) => file.url.endsWith('.zip'))).toHaveLength(2);
    for (const file of [...win.files, ...mac.files]) {
      const data = await readFile(path.join(output, file.url));
      expect(file.sha512).toBe(createHash('sha512').update(data).digest('base64'));
      expect(file.size).toBe(data.length);
    }
    expect(
      (await readFile(path.join(output, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n'),
    ).toHaveLength(7);
    await rm(path.join(output, names[2]));
    await expect(
      run(process.execPath, [script, output], {
        cwd: directory,
        env: { ...process.env, GITHUB_REF_TYPE: 'branch' },
      }),
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
