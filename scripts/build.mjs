import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import gettextParser from 'gettext-parser';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'schemas'), { recursive: true });

run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json']);

await cp(resolve(root, 'metadata.json'), resolve(dist, 'metadata.json'));
await cp(resolve(root, 'LICENSE'), resolve(dist, 'LICENSE'));
await cp(resolve(root, 'stylesheet.css'), resolve(dist, 'stylesheet.css'));
await cp(
  resolve(root, 'schemas/org.gnome.shell.extensions.claudeland.gschema.xml'),
  resolve(dist, 'schemas/org.gnome.shell.extensions.claudeland.gschema.xml'),
);

run('glib-compile-schemas', [resolve(dist, 'schemas')]);

for (const language of ['it']) {
  const po = gettextParser.po.parse(
    await readFile(resolve(root, `po/${language}.po`)),
  );
  const localeDirectory = resolve(dist, `locale/${language}/LC_MESSAGES`);
  await mkdir(localeDirectory, { recursive: true });
  await writeFile(
    resolve(localeDirectory, 'claudeland.mo'),
    gettextParser.mo.compile(po),
  );
}

const metadataPath = resolve(dist, 'metadata.json');
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`Built extension in ${dist}`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
