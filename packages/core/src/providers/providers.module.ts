import { Module } from '@nestjs/common';
import { SecretsModule } from '../secrets/secrets.module';
import { CLAUDE_ENGINE_SETTINGS, readClaudeEngineSettings, type ClaudeEngineSettings } from './claude-engine.config';
import { ProviderModeService } from './provider-mode.service';
import { PROVIDER_MODE_SETTINGS, readProviderModeSettings, type ProviderModeSettings } from './provider-modes.config';

/**
 * Mock/live switch per provider (R1-11). Modes are read once from the environment when the
 * composition root builds the graph; `ProviderModeService.onModuleInit` then fails the start when
 * a live provider has no key. The watcher binds `ProviderModeService` as C6 `ProviderModePort`.
 */
@Module({
  imports: [SecretsModule],
  providers: [
    { provide: PROVIDER_MODE_SETTINGS, useFactory: (): ProviderModeSettings => readProviderModeSettings(process.env) },
    { provide: CLAUDE_ENGINE_SETTINGS, useFactory: (): ClaudeEngineSettings => readClaudeEngineSettings(process.env) },
    ProviderModeService,
  ],
  exports: [ProviderModeService],
})
export class ProvidersModule {}
