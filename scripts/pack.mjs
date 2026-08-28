import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const build = resolve(root, 'build');

await rm(build, { recursive: true, force: true });
await mkdir(build, { recursive: true });

const result = spawnSync(
  'gnome-extensions',
  [
    'pack',
    '--force',
    '--out-dir', build,
    '--extra-source=domain',
    '--extra-source=services',
    '--extra-source=ui',
    resolve(root, 'dist'),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Packed extension in ${build}`);
