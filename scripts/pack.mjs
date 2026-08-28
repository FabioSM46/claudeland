import { mkdir, readFile, rm } from 'node:fs/promises';
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
    '--extra-source=LICENSE',
    '--extra-source=domain',
    '--extra-source=locale',
    '--extra-source=services',
    '--extra-source=ui',
    resolve(root, 'dist'),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const metadata = JSON.parse(await readFile(resolve(root, 'metadata.json'), 'utf8'));
const archive = resolve(build, `${metadata.uuid}.shell-extension.zip`);
let listing = run('unzip', ['-Z1', archive], true).stdout.trim().split('\n');
if (listing.includes('schemas/gschemas.compiled')) {
  run('zip', ['-d', archive, 'schemas/gschemas.compiled']);
  listing = run('unzip', ['-Z1', archive], true).stdout.trim().split('\n');
}
const forbidden = ['domain/index.js', 'schemas/gschemas.compiled'];
for (const path of forbidden) {
  if (listing.includes(path)) {
    console.error(`Package contains forbidden file: ${path}`);
    process.exit(1);
  }
}
if (!listing.includes('LICENSE')) {
  console.error('Package does not contain LICENSE');
  process.exit(1);
}

console.log(`Packed and verified extension in ${archive}`);

function run(command, args, capture = false) {
  const commandResult = spawnSync(command, args, {
    cwd: root,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (commandResult.status !== 0) {
    if (capture && commandResult.stderr) {
      console.error(commandResult.stderr.trim());
    }
    process.exit(commandResult.status ?? 1);
  }
  return commandResult;
}
