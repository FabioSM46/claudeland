// Restores blank lines between top-level functions and classes in the built
// packages.
//
// The extensions.gnome.org review asks for a blank line between functions and
// classes, and it reads the JavaScript that ships, not the TypeScript sources.
// The sources already comply, but tsc drops those blank lines when it emits and
// esbuild does not reproduce them either. Prettier cannot help: it preserves
// blank lines and never inserts them. ESLint can, so the packaged output is
// passed through the same padding rules the sources are linted with.
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';

import { PADDING_RULES } from './padding-rules.mjs';

const root = resolve(import.meta.dirname, '..');

const eslint = new ESLint({
  fix: true,
  // Generated output: use only the rules below, not the project lint config.
  overrideConfigFile: true,
  overrideConfig: { rules: PADDING_RULES },
  ignore: false,
});

const targets = [];
for (const directory of ['dist', 'dist-legacy']) {
  targets.push(...(await javascriptFiles(resolve(root, directory))));
}

const results = await eslint.lintFiles(targets);
await ESLint.outputFixes(results);

const unfixed = results.flatMap((result) => result.messages.filter((message) => !message.fix));
if (unfixed.length > 0) {
  console.error('Could not add every required blank line:');
  for (const message of unfixed) {
    console.error(`  ${message.ruleId}: ${message.message}`);
  }
  process.exit(1);
}

console.log(`Formatted ${targets.length} generated files`);

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => resolve(entry.parentPath, entry.name));
}
