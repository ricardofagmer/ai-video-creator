// .mjs because this package is CommonJS (no "type": "module") and @studio/eslint-config is ESM.
// base, not nest: the shell has no Nest module (ADR 0005, ticket 09-shell-dependencies).
import base from '@studio/eslint-config/base';

// out/ holds the packaging stage (bundled main.js and the built .app); it is generated and
// git-ignored, so linting it fails on bundler output rather than on our source.
export default [{ ignores: ['out/**'] }, ...base];
