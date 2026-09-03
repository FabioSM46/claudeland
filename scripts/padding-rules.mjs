// The blank-line rules the extensions.gnome.org review asks for, shared by the
// project lint config and by the pass over the generated packages.
export const PADDING_RULES = {
  // Methods are separated; consecutive one-line fields are left alone, which is
  // how the sources already read.
  'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
  'padding-line-between-statements': [
    'error',
    // `export function` and `export class` are export statements rather than
    // function or class ones, so `export` has to be listed for the rule to
    // reach an exported declaration at all.
    { blankLine: 'always', prev: '*', next: ['function', 'class', 'export'] },
    { blankLine: 'always', prev: ['function', 'class', 'export'], next: '*' },
  ],
};
