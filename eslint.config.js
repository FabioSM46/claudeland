import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

import { PADDING_RULES } from './scripts/padding-rules.mjs';

export default tseslint.config(
  {
    ignores: ['build/**', 'coverage/**', 'dist/**', 'graphify-out/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The extensions.gnome.org review asks for a blank line between functions
    // and classes. The same rules are applied to the generated packages by
    // scripts/format-output.mjs, which is what a reviewer actually reads.
    files: ['**/*.{js,mjs,ts}'],
    rules: PADDING_RULES,
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        global: 'readonly',
        logError: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
      },
    },
  },
  {
    // GNOME Shell probe and helpers, loaded by the shell or by gjs rather than
    // by the build.
    files: ['tests/shell/**/*.js'],
    languageOptions: {
      globals: {
        ARGV: 'readonly',
        console: 'readonly',
        global: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
);
