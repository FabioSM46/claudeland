import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

run('pnpm', ['build']);

// GNOME Shell 45 introduced the ES module extension API. Anything older loads
// the legacy package built from the same sources.
const dist = resolve(root, shellMajorVersion() < 45 ? 'dist-legacy' : 'dist');

const metadata = JSON.parse(await readFile(resolve(dist, 'metadata.json'), 'utf8'));
if (metadata.uuid !== 'claudeland@fabiosm46.dev') {
  throw new Error('Refusing to install an extension with an unexpected UUID');
}

const extensionRoot = resolve(homedir(), '.local/share/gnome-shell/extensions');
const destination = resolve(extensionRoot, metadata.uuid);
if (!destination.startsWith(`${extensionRoot}/`)) {
  throw new Error('Resolved extension destination escaped the user extension directory');
}

await mkdir(extensionRoot, { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(dist, destination, { recursive: true });

console.log(`Installed ${metadata.uuid} in ${destination}`);
console.log(`Package built for GNOME Shell ${metadata['shell-version'].join(', ')}`);
console.log('Log out and back in after the first install, then run:');
console.log(`  gnome-extensions enable ${metadata.uuid}`);

function shellMajorVersion() {
  const result = spawnSync('gnome-shell', ['--version'], { encoding: 'utf8' });
  const version = Number.parseInt(/(\d+)/.exec(result.stdout ?? '')?.[1] ?? '', 10);
  if (!Number.isFinite(version)) {
    throw new Error('Could not determine the GNOME Shell version; is gnome-shell installed?');
  }
  return version;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
