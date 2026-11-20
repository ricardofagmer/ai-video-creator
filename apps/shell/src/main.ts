import { join } from 'node:path';
import { runShellApp } from './electron/shell-app';

// The packaging step places shell-config.json beside this bundled file inside app.asar, so the
// asar integrity fuse covers it; no other source of configuration is read.
runShellApp({ argv: process.argv, configPath: join(__dirname, 'shell-config.json'), environment: process.env });
