import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

if (process.platform !== 'win32' || process.env.CI !== 'true')
  throw new Error('The real installation test must run in an isolated Windows CI runner.');
const run = promisify(execFile);
const root = path.resolve('artifacts/update-install');
await fs.mkdir(root, { recursive: true });
const userData = path.join(process.env.APPDATA, 'ChattyDock Update Test');
const installDir = path.join(root, 'installed');
const executable = path.join(installDir, 'ChattyDock Update Test.exe');
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const baseline = pkg.version;
const parts = baseline.split('.').map(Number);
const target = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
async function execute(exe, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Test process failed with exit ${code}`)),
    );
  });
}
async function waitFor(work, description, timeout = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await work()) return;
    } catch {
      /* Installation/startup files can be temporarily locked. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
for (const version of [baseline, target]) {
  await execute(process.execPath, ['scripts/package.mjs', 'win', 'x64'], {
    ...process.env,
    DOCK_SIGNED: '0',
    DOCK_BUILD_UPDATE_TEST: '1',
    DOCK_TEST_VERSION: version,
    DOCK_OUTPUT_DIR: path.join(root, version),
  });
}
const baselineInstaller = path.join(root, baseline, `ChattyDock-${baseline}-win-x64.exe`);
const targetInstaller = path.join(root, target, `ChattyDock-${target}-win-x64.exe`);
const payload = await fs.readFile(targetInstaller);
const filename = path.basename(targetInstaller);
const updateInfo = JSON.stringify({
  version: target,
  files: [
    {
      url: filename,
      sha512: createHash('sha512').update(payload).digest('base64'),
      size: payload.length,
    },
  ],
  path: filename,
  sha512: createHash('sha512').update(payload).digest('base64'),
  releaseDate: new Date().toISOString(),
});
let metadataRequests = 0,
  payloadRequests = 0;
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname;
  if (name === '/latest.yml') {
    metadataRequests++;
    response.writeHead(200, { 'Content-Type': 'application/yaml' });
    response.end(updateInfo);
  } else if (name === `/${filename}`) {
    payloadRequests++;
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
    });
    response.end(payload);
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let started;
try {
  await execute(baselineInstaller, ['/S', `/D=${installDir}`]);
  await fs.access(executable);
  // Separate product name/app ID keep this test away from production installations.
  started = spawn(executable, ['--dock-update-test'], {
    env: { ...process.env, DOCK_UPDATE_E2E_FEED: origin },
    windowsHide: true,
    stdio: 'ignore',
  });
  const settingsFile = path.join(userData, 'settings.json');
  await waitFor(
    async () => JSON.parse(await fs.readFile(settingsFile, 'utf8')).lastAppVersion === baseline,
    'baseline startup',
  );
  const original = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  await waitFor(
    async () => JSON.parse(await fs.readFile(settingsFile, 'utf8')).lastAppVersion === target,
    'download, silent installation, and automatic relaunch',
  );
  const updated = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  if (!metadataRequests || !payloadRequests)
    throw new Error('The real updater did not request metadata and the installer.');
  if (updated.defaultProfileId !== original.defaultProfileId)
    throw new Error('Profile identity was lost during upgrade.');
  const result = {
    passed: true,
    baseline,
    target,
    metadataRequests,
    payloadRequests,
    installedPath: executable,
    persistedProfile: true,
    restartedVersion: updated.lastAppVersion,
  };
  await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
  console.log(
    `PASS installed ${baseline} → ${target}: startup check, SHA-512 download validation, silent installation, automatic restart, and profile preservation.`,
  );
} catch (error) {
  await fs.writeFile(
    path.join(root, 'result.json'),
    JSON.stringify(
      { passed: false, baseline, target, metadataRequests, payloadRequests, error: error.message },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
  // Scope cleanup to the dedicated test product; never stop a production process.
  const escaped = executable.replace(/'/g, "''");
  await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "Name = 'ChattyDock Update Test.exe'" | Where-Object { $_.ExecutablePath -eq '${escaped}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
    ],
    { windowsHide: true },
  ).catch(() => {});
  started?.unref();
}
