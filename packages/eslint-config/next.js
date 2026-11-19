import base from './base.js';

// Next.js pages and layouts export default React components; their return types are inferred.
export default [
  ...base,
  {
    files: ['app/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
];
