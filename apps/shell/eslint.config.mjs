// .mjs because this package is CommonJS (no "type": "module") and @studio/eslint-config is ESM.
// base, not nest: the shell has no Nest module (ADR 0005, ticket 09-shell-dependencies).
import base from '@studio/eslint-config/base';

export default base;
