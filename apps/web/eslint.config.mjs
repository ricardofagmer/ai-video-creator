// .mjs because this package is CommonJS (no "type": "module") and @studio/eslint-config is ESM.
import next from '@studio/eslint-config/next';

// `next build` regenerates next-env.d.ts with a triple-slash reference; it is not ours to lint.
export default [{ ignores: ['next-env.d.ts'] }, ...next];
