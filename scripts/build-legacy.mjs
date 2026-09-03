// Builds the package for GNOME Shell 42 to 44.
//
// Those releases predate the ES module port in GNOME Shell 45: they load
// extension.js and prefs.js as legacy scripts through the `imports` object and
// call a module-level init(). The TypeScript sources stay written against the
// modern API, and this build bundles them into one legacy script per entry
// point, resolving every `gi://` and `resource://` import to its `imports`
// equivalent through the shims in scripts/legacy/shims.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const legacyDist = resolve(root, 'dist-legacy');
const legacyProbe = resolve(root, 'dist-legacy-probe');
const shims = resolve(root, 'scripts/legacy/shims');

// Namespaces that need an explicit version. St, Clutter and Meta are already
// loaded by the Shell process, and Gio, GLib and GObject have a single typelib.
const GI_VERSIONS = { Gtk: '4.0', Adw: '1' };

const RESOURCE_SHIMS = {
  'resource:///org/gnome/shell/ui/main.js': 'resource-main.js',
  'resource:///org/gnome/shell/ui/panelMenu.js': 'resource-panel-menu.js',
  'resource:///org/gnome/shell/ui/popupMenu.js': 'resource-popup-menu.js',
  'resource:///org/gnome/shell/extensions/extension.js': 'resource-extension.js',
  'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js': 'resource-prefs.js',
};

const legacyImports = {
  name: 'legacy-imports',
  setup(build) {
    build.onResolve({ filter: /^gi:\/\// }, (args) => {
      // Any ?version= query is dropped: on these releases the Shell has already
      // loaded its own namespaces, and the versions that still need pinning are
      // listed in GI_VERSIONS or decided by the libsoup shim.
      const namespace = args.path.replace(/^gi:\/\//, '').split('?')[0];
      if (namespace === 'Soup') {
        return { path: resolve(shims, 'gi-soup.js') };
      }
      return { path: namespace, namespace: 'gi' };
    });

    build.onLoad({ filter: /.*/, namespace: 'gi' }, (args) => {
      const version = GI_VERSIONS[args.path];
      const pin = version
        ? `imports.gi.versions[${JSON.stringify(args.path)}] = ${JSON.stringify(version)};\n`
        : '';
      return {
        contents: `${pin}export default imports.gi[${JSON.stringify(args.path)}];\n`,
        loader: 'js',
      };
    });

    // The UI probe lives beside the packaged modules in the modern layout; the
    // legacy build bundles it from the TypeScript sources instead.
    build.onResolve({ filter: /^\.\/(ui|domain|services)\// }, (args) => {
      if (!args.importer.startsWith(resolve(root, 'tests'))) {
        return undefined;
      }
      return { path: resolve(root, 'src', args.path.replace(/^\.\//, '').replace(/\.js$/, '.ts')) };
    });

    build.onResolve({ filter: /^resource:\/\// }, (args) => {
      const shim = RESOURCE_SHIMS[args.path];
      if (!shim) {
        throw new Error(`No legacy shim for ${args.path}; add one in scripts/legacy/shims`);
      }
      return { path: resolve(shims, shim) };
    });
  },
};

await rm(legacyDist, { recursive: true, force: true });
await mkdir(legacyDist, { recursive: true });
await rm(legacyProbe, { recursive: true, force: true });

// GNOME Shell 42 runs gjs 1.72, which is SpiderMonkey 91.
const GJS_TARGET = 'firefox91';

// Legacy entry points are plain scripts: the Shell calls the module-level
// init() below, and initTranslations() has to run before any gettext call.
const INIT_TRANSLATIONS = '    imports.misc.extensionUtils.initTranslations();';

function bundle({ entry, outdir, out, globalName, footer }) {
  return esbuild.build({
    entryPoints: [{ in: entry, out }],
    outdir,
    bundle: true,
    format: 'iife',
    globalName,
    platform: 'neutral',
    target: GJS_TARGET,
    charset: 'utf8',
    legalComments: 'none',
    plugins: [legacyImports],
    footer: { js: `\n${footer.join('\n')}\n` },
  });
}

await bundle({
  entry: resolve(root, 'src/extension.ts'),
  outdir: legacyDist,
  out: 'extension',
  globalName: 'claudeland',
  footer: ['function init() {', INIT_TRANSLATIONS, '    return new claudeland.default();', '}'],
});

await bundle({
  entry: resolve(root, 'src/prefs.ts'),
  outdir: legacyDist,
  out: 'prefs',
  globalName: 'claudelandPrefs',
  footer: [
    'function init() {',
    INIT_TRANSLATIONS,
    '}',
    '',
    'function fillPreferencesWindow(window) {',
    '    return new claudelandPrefs.default().fillPreferencesWindow(window);',
    '}',
  ],
});

// Test-only: the same UI probe the modern verification uses, bundled as a
// legacy script so it can run against GNOME Shell 42 to 44. It is never
// packaged and never installed on a real session.
await bundle({
  entry: resolve(root, 'tests/shell/uicheck-extension.js'),
  outdir: legacyProbe,
  out: 'extension',
  globalName: 'claudelandProbe',
  footer: [
    'function init() {',
    INIT_TRANSLATIONS,
    '    return new claudelandProbe.default();',
    '}',
  ],
});

// The modern build already produced the compiled schemas, translations and
// stylesheet; the legacy package ships exactly the same assets.
for (const asset of ['LICENSE', 'stylesheet.css', 'schemas', 'locale']) {
  await cp(resolve(dist, asset), resolve(legacyDist, asset), { recursive: true });
}

const metadata = JSON.parse(await readFile(resolve(root, 'metadata.json'), 'utf8'));
const overrides = JSON.parse(await readFile(resolve(root, 'metadata-legacy.json'), 'utf8'));
await writeFile(
  resolve(legacyDist, 'metadata.json'),
  `${JSON.stringify({ ...metadata, ...overrides }, null, 2)}\n`,
);

// A legacy script must not contain ES module syntax, or the Shell fails to load
// it with a bare syntax error.
for (const entry of ['extension.js', 'prefs.js']) {
  const source = await readFile(resolve(legacyDist, entry), 'utf8');
  if (/^\s*(import|export)\s/m.test(source)) {
    console.error(`${entry} still contains ES module syntax`);
    process.exit(1);
  }
  // Parse it as a plain script, the way the legacy importer does.
  run(process.execPath, ['--check', resolve(legacyDist, entry)]);
}
run(process.execPath, ['--check', resolve(legacyProbe, 'extension.js')]);

console.log(`Built legacy extension in ${legacyDist}`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
