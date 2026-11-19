import { Module } from '@nestjs/common';
import { ENVIRONMENT_SECRETS, readEnvironmentSecrets, type EnvironmentSecrets } from './environment-secrets';
import { KeychainReader, KeychainWriter } from './keychain';
import { SecretsService } from './secrets.service';

/**
 * Provider keys (R1-11). The environment is read once, here, when the composition root builds
 * the module graph (rules/architecture.md "Configuration"); only the named key variables are
 * read and they are wrapped in `Secret` immediately. `KeychainWriter` is exported for the CLI's
 * `studio secrets set` (R1-21) only.
 */
@Module({
  providers: [
    { provide: ENVIRONMENT_SECRETS, useFactory: (): EnvironmentSecrets => readEnvironmentSecrets(process.env) },
    KeychainReader,
    KeychainWriter,
    SecretsService,
  ],
  exports: [SecretsService, KeychainWriter],
})
export class SecretsModule {}
