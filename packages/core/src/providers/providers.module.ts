import { Module } from '@nestjs/common';
import { DataHome } from '../paths/data-home';
import { PathsModule } from '../paths/paths.module';
import { SecretsModule } from '../secrets/secrets.module';
import { CLAUDE_ENGINE_SETTINGS, readClaudeEngineSettings, type ClaudeEngineSettings } from './claude-engine.config';
import { ProviderModeService } from './provider-mode.service';
import { PROVIDER_MODE_SETTINGS, readProviderModeSettings, type ProviderModeSettings } from './provider-modes.config';
import { providerSettingsEnvironment } from './provider-settings-file';

/**
 * Mock/live switch per provider (R1-11). Modes are read once, when the composition root builds the
 * graph, from the environment over `<data home>/providers.json` (variables win);
 * `ProviderModeService.onModuleInit` then fails the start when a live provider has no key. The
 * watcher binds `ProviderModeService` as C6 `ProviderModePort`.
 */
@Module({
  imports: [SecretsModule, PathsModule],
  providers: [
    {
      provide: PROVIDER_MODE_SETTINGS,
      inject: [DataHome],
      useFactory: (dataHome: DataHome): ProviderModeSettings => readProviderModeSettings(providerSettingsEnvironment(dataHome, process.env)),
    },
    {
      provide: CLAUDE_ENGINE_SETTINGS,
      inject: [DataHome],
      useFactory: (dataHome: DataHome): ClaudeEngineSettings => readClaudeEngineSettings(providerSettingsEnvironment(dataHome, process.env)),
    },
    ProviderModeService,
  ],
  exports: [ProviderModeService],
})
export class ProvidersModule {}
