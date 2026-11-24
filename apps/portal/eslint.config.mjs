// .mjs because this package is CommonJS (no "type": "module") and @studio/eslint-config is ESM.
import next from '@studio/eslint-config/next';

// `next build` regenerates next-env.d.ts with a triple-slash reference; `out/` is the static export.
export default [{ ignores: ['next-env.d.ts', 'out/**'] }, ...next];
