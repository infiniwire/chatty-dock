import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { bounded, closeTestApplication } from './electron-test-cleanup.mjs';

// A real, disposable process must be terminated when graceful cleanup hangs.
const target = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore',
  windowsHide: true,
});
const exited = new Promise((resolve) => target.once('exit', resolve));
await closeTestApplication({ close: () => new Promise(() => {}), process: () => target }, 200);
await bounded(() => exited, 3000, 'Fixture process exit');
assert.notEqual(target.exitCode === null && target.signalCode === null, true);

// Run the actual Electron harness with an injected assertion failure and a
// diagnostic call that never resolves. It must save evidence and exit nonzero.
const run = spawn(process.execPath, ['scripts/electron-test.mjs'], {
  env: { ...process.env, DOCK_TEST_FAILURE_CLEANUP: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
run.stdout.on('data', (chunk) => (output += chunk));
run.stderr.on('data', (chunk) => (output += chunk));
let result;
try {
  result = await bounded(
    () =>
      new Promise((resolve, reject) => {
        run.once('error', reject);
        run.once('exit', (code, signal) => resolve({ code, signal }));
      }),
    75000,
    'Electron failure cleanup regression',
  );
} catch (error) {
  run.kill();
  throw error;
}
assert.notEqual(result.code, 0, output);
assert.match(output, /Injected integration failure for cleanup verification/);
const context = JSON.parse(
  await readFile(
    process.env.DOCK_EXECUTABLE
      ? 'artifacts/packaged-failure-context.json'
      : 'artifacts/failure-context.json',
    'utf8',
  ),
);
assert(context.localPages.some((page) => page.unavailable === true));
const report = JSON.parse(
  await readFile(
    process.env.DOCK_EXECUTABLE ? 'artifacts/packaged-tests.json' : 'artifacts/electron-tests.json',
    'utf8',
  ),
);
assert.equal(report.passed, false);
assert.equal(report.cleanupOk, false);
console.log(
  'PASS failed Electron test collects bounded diagnostics and exits; hung cleanup terminates its isolated process.',
);
