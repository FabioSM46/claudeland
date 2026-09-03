import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const build = resolve(root, 'build');

const metadata = JSON.parse(await readFile(resolve(root, 'metadata.json'), 'utf8'));
const packageMetadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (metadata['version-name'] !== packageMetadata.version) {
  console.error(
    `metadata.json version-name (${metadata['version-name'] ?? 'missing'}) ` +
      `does not match package.json version (${packageMetadata.version})`,
  );
  process.exit(1);
}

// Both packages carry the same uuid and version: extensions.gnome.org serves
// whichever one matches the visitor's GNOME Shell release.
const targets = [
  {
    source: resolve(root, 'dist'),
    archive: `${metadata.uuid}.shell-extension.zip`,
    extraSources: ['LICENSE', 'domain', 'locale', 'services', 'ui'],
  },
  {
    source: resolve(root, 'dist-legacy'),
    archive: `${metadata.uuid}.legacy.shell-extension.zip`,
    extraSources: ['LICENSE', 'locale'],
  },
];

await rm(build, { recursive: true, force: true });
await mkdir(build, { recursive: true });

for (const target of targets) {
  const staging = resolve(build, 'staging');
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  run('gnome-extensions', [
    'pack',
    '--force',
    '--out-dir',
    staging,
    ...target.extraSources.map((source) => `--extra-source=${source}`),
    target.source,
  ]);

  const archive = resolve(build, target.archive);
  await rename(resolve(staging, `${metadata.uuid}.shell-extension.zip`), archive);
  await rm(staging, { recursive: true, force: true });

  verifyArchive(archive);

  const checksum = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  const checksumPath = `${archive}.sha256`;
  await writeFile(checksumPath, `${checksum}  ${basename(archive)}\n`);

  console.log(`Packed and verified extension in ${archive}`);
  console.log(`Wrote SHA-256 checksum to ${checksumPath}`);
}

function verifyArchive(archive) {
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
}

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
