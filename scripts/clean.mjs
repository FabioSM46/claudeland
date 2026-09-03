import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
for (const directory of ['build', 'coverage', 'dist']) {
  await rm(resolve(root, directory), { recursive: true, force: true });
}

console.log('Removed generated build artifacts');
