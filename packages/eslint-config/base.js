import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Encodes rules/base.md: no `any`, no silencing assertions, one import per module.
export default tseslint.config(
  { ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-duplicate-imports': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-restricted-globals': [
        'error',
        { name: 'parseInt', message: 'Use Number.parseInt.' },
        { name: 'parseFloat', message: 'Use Number.parseFloat.' },
      ],
    },
  },
);
