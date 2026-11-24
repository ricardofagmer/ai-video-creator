import { join } from 'node:path';
import { runShellApp } from './electron/shell-app';

// The local build (scripts/package-app.mjs, development mode) places shell-config.json beside this bundled file inside
// app.asar, so the asar integrity fuse covers it. The packaged .dmg app bakes no shell-config.json:
// it derives its configuration from Contents/Resources/runtime/ and reads the portal addresses from
// portal-settings.json beside this file, which a value in the process environment overrides.
runShellApp({ argv: process.argv, configPath: join(__dirname, 'shell-config.json'), environment: process.env });
