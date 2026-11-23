import fs from 'node:fs/promises';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error('A valid release version is required.');
const changelog = await fs.readFile('CHANGELOG.md', 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.indexOf(`## ${version}`);
const entry = start < 0 ? [] : lines.slice(start + 1);
const next = entry.findIndex((line) => /^## /.test(line));
const changes = (next < 0 ? entry : entry.slice(0, next)).join('\n').trim();
process.stdout.write(
  `## Changes\n\n${changes || 'Routine maintenance and compatibility checks.'}\n`,
);
