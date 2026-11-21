import { Module } from '@nestjs/common';
import { DataHome } from '../paths/data-home';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SecretsModule } from '../secrets/secrets.module';
import { SecretsService } from '../secrets/secrets.service';
import { productionLiveClientContext, type LivePlatformClientContext } from './clients/live-client-factory';
import { LIVE_PLATFORM_CLIENT_CONTEXT, PLATFORM_CLIENTS, PlatformClientRegistry, type PlatformClients } from './clients/platform-client.registry';
import { RedactingPlatformClients } from './clients/redacting-platform-client';
import { PlatformCredentials } from './platform-credentials';
import { PLATFORM_MODE_SETTINGS, readPlatformModeSettings, type PlatformModeSettings } from './platform-modes.config';
import { PLATFORM_CLOCK, PLATFORM_FILE_ROOT, PLATFORM_PROCESS_ID, systemPlatformClock } from './platform-runtime';
import { PlatformStatusReader } from './platform-status.reader';
import { PlatformViewReader } from './platform-view.reader';
import { PublicationTrackingReader } from './publication-tracking';
import { AccountStore, GateStore, HealthReader } from './stores/platform-file.stores';
import { PublishFileReader } from './stores/publish-file.reader';
import { TokenLock } from './token-lock';
import { KeychainPlatformTokenVault } from './vault/keychain-token-vault';
import { PLATFORM_TOKEN_VAULT } from './vault/token-vault.port';

/**
 * Read side of the platform module for the watcher (SPEC 0007 sections 4.6 and 5.5, K1): the mode
 * settings, the clock, the platform file root, the read-only file stores, the status and view
 * readers, the client credentials, the client registry (mock by default, so zero outbound requests
 * with every platform in mock mode), the Keychain token vault and `token.lock`. It registers no
 * command or query handler and nothing it provides writes SQLite, `gates.json` or `account.json`.
 * The watcher writes its own files (`claim`, `state.json`, `health.json`, `cursor.json`, the
 * metrics inbox, `publications.jsonl`) through the shared helpers in its own scope, and the token
 * item through the vault under `token.lock`. The api and the CLI import `PlatformsModule` instead.
 * The environment is read once, here, when the composition root builds the module graph.
 */
@Module({
  imports: [PathsModule, PrismaModule, SecretsModule],
  providers: [
    { provide: PLATFORM_FILE_ROOT, useFactory: (dataHome: DataHome): string => dataHome.platform, inject: [DataHome] },
    { provide: PLATFORM_CLOCK, useValue: systemPlatformClock },
    { provide: PLATFORM_PROCESS_ID, useFactory: (): number => process.pid },
    { provide: PLATFORM_MODE_SETTINGS, useFactory: (): PlatformModeSettings => readPlatformModeSettings(process.env) },
    { provide: LIVE_PLATFORM_CLIENT_CONTEXT, useFactory: (): LivePlatformClientContext => productionLiveClientContext() },
    { provide: PLATFORM_TOKEN_VAULT, useClass: KeychainPlatformTokenVault },
    PlatformClientRegistry,
    {
      // Finding S4: every token a client reveals or receives is registered with the redactor first.
      provide: PLATFORM_CLIENTS,
      useFactory: (registry: PlatformClientRegistry, secrets: SecretsService): PlatformClients => new RedactingPlatformClients(registry, secrets),
      inject: [PlatformClientRegistry, SecretsService],
    },
    GateStore,
    AccountStore,
    HealthReader,
    PublishFileReader,
    TokenLock,
    PlatformCredentials,
    PlatformStatusReader,
    PublicationTrackingReader,
    PlatformViewReader,
  ],
  exports: [
    PLATFORM_FILE_ROOT,
    PLATFORM_CLOCK,
    PLATFORM_PROCESS_ID,
    PLATFORM_MODE_SETTINGS,
    PLATFORM_TOKEN_VAULT,
    PLATFORM_CLIENTS,
    GateStore,
    AccountStore,
    HealthReader,
    PublishFileReader,
    TokenLock,
    PlatformCredentials,
    PlatformStatusReader,
    PublicationTrackingReader,
    PlatformViewReader,
  ],
})
export class PlatformsReadModule {}
