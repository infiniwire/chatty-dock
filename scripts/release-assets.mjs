import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
const tag = process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_REF_TYPE === 'tag' && tag !== `v${version}`)
  throw new Error(`Tag ${tag} does not match package version ${version}.`);
const dir = process.argv[2] || 'release-assets';
const files = await fs.readdir(dir);
const expected = [
  `ChattyDock-${version}-win-x64.exe`,
  `ChattyDock-${version}-mac-x64.dmg`,
  `ChattyDock-${version}-mac-x64.zip`,
  `ChattyDock-${version}-mac-arm64.dmg`,
  `ChattyDock-${version}-mac-arm64.zip`,
];
const manifest = [];
for (const name of expected) {
  if (!files.includes(name)) throw new Error(`Required release artifact missing: ${name}`);
  const data = await fs.readFile(path.join(dir, name));
  if (!data.length) throw new Error(`Empty artifact: ${name}`);
  manifest.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
}
// JSON is valid YAML. Emit one merged Mac manifest so native matrix jobs cannot
// overwrite each other's latest-mac.yml and strand an architecture.
for (const [name, packages] of [
  ['latest.yml', expected.filter((file) => file.endsWith('.exe'))],
  ['latest-mac.yml', expected.filter((file) => /\.(zip|dmg)$/.test(file))],
]) {
  const entries = [];
  for (const filename of packages) {
    const data = await fs.readFile(path.join(dir, filename));
    entries.push({
      url: filename,
      sha512: createHash('sha512').update(data).digest('base64'),
      size: data.length,
    });
  }
  const data =
    JSON.stringify(
      {
        version,
        files: entries,
        path: entries[0].url,
        sha512: entries[0].sha512,
        releaseDate: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n';
  await fs.writeFile(path.join(dir, name), data);
  manifest.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
}
await fs.writeFile(path.join(dir, 'SHA256SUMS.txt'), `${manifest.join('\n')}\n`);
console.log(
  `Validated ${expected.length} packages, generated both update manifests and checksums.`,
);
