import base from './base.js';

// Nest relies on constructor injection and decorators; empty constructors with parameter
// properties are idiomatic there.
export default [
  ...base,
  {
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-useless-constructor': 'off',
    },
  },
];
