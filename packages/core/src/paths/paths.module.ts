import { homedir } from 'node:os';
import { Module } from '@nestjs/common';
import { DATA_HOME_ENV_VAR, DataHome, resolveDataHome } from './data-home';

/**
 * Provides the resolved `DataHome`. The environment is read once, here, when the composition root
 * builds the module graph (rules/architecture.md "Configuration"); no other provider reads it.
 */
@Module({
  providers: [
    {
      provide: DataHome,
      useFactory: (): DataHome => resolveDataHome({ homeDirectory: homedir(), override: process.env[DATA_HOME_ENV_VAR] }),
    },
  ],
  exports: [DataHome],
})
export class PathsModule {}
