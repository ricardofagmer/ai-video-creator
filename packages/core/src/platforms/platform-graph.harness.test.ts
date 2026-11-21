import { readEnvironmentSecrets } from '../secrets/environment-secrets';
import { KeychainReader, type KeychainLookup } from '../secrets/keychain';
import { SecretsService } from '../secrets/secrets.service';
import { PlatformClientRegistry, type PlatformClients } from './clients/platform-client.registry';
import { CancelPublishHandler } from './commands/cancel-publish.handler';
import { CompleteConnectionHandler } from './commands/complete-connection.handler';
import { DisconnectHandler } from './commands/disconnect.handler';
import { RequestPublishHandler } from './commands/request-publish.handler';
import { StartConnectionHandler } from './commands/start-connection.handler';
import { SyncPublishAttemptsHandler } from './commands/sync-publish-attempts.handler';
import { InMemoryOAuthStateStore } from './oauth/oauth-state.store';
import { PlatformCredentials } from './platform-credentials';
import { type PlatformHarness } from './platform-harness.harness.test';
import { type PlatformModeSettings } from './platform-modes.config';
import { PlatformStatusReader } from './platform-status.reader';
import { PlatformViewReader } from './platform-view.reader';
import { PlatformWriteQueue } from './platform-write.queue';
import { PublicationTrackingReader } from './publication-tracking';
import { PublicationAttemptRepository } from './publish/publication-attempt.repository';
import { PublicationLinker } from './publish/publication-linker';
import { RunBiometricAssets } from './publish/run-biometric-assets';
import { RunPublishFacts } from './publish/run-publish-facts';
import { AccountStore, GateStore, HealthReader } from './stores/platform-file.stores';
import { PublishFileReader } from './stores/publish-file.reader';
import { TokenLock } from './token-lock';
import { InMemoryPlatformTokenVault } from './vault/in-memory-token-vault';

/*
 * Test-only wiring of the platform handlers over a harness, as the Nest module would bind them,
 * with the in-memory vault, an in-memory state store, a Keychain reader that never runs a tool and
 * a live context whose fetch throws. No network, no Keychain, no real data home. Helpers only:
 * the `.harness.test.ts` name keeps the file out of the build; it declares no test.
 */

/** Never runs `/usr/bin/security`: every provider key reads as absent. */
class AbsentKeychain extends KeychainReader {
  override read(): Promise<KeychainLookup> {
    return Promise.resolve({ status: 'not-found' });
  }
}

export const ALL_MOCK_MODES: PlatformModeSettings = {
  youtube: { mode: 'mock', fault: 'none' },
  instagram: { mode: 'mock', fault: 'none' },
  tiktok: { mode: 'mock', fault: 'none' },
};

const offlineContext = {
  fetch: async (): Promise<Response> => {
    throw new Error('network is not allowed in platform tests');
  },
};

export interface PlatformGraph {
  vault: InMemoryPlatformTokenVault;
  states: InMemoryOAuthStateStore;
  attempts: PublicationAttemptRepository;
  start: StartConnectionHandler;
  complete: CompleteConnectionHandler;
  disconnect: DisconnectHandler;
  requestPublish: RequestPublishHandler;
  cancelPublish: CancelPublishHandler;
  syncAttempts: SyncPublishAttemptsHandler;
}

export function buildPlatformGraph(
  harness: PlatformHarness,
  options: {
    modes?: PlatformModeSettings;
    clients?: PlatformClients;
    environment?: Record<string, string>;
    pid?: number;
    /** A vault subclass that observes or breaks a step; the plain in-memory vault otherwise. */
    vault?: InMemoryPlatformTokenVault;
  } = {},
): PlatformGraph {
  const { platformRoot, prisma, clock, dataHome } = harness;
  const modes = options.modes ?? ALL_MOCK_MODES;
  const clients = options.clients ?? new PlatformClientRegistry(modes, offlineContext);
  const credentials = new PlatformCredentials(new SecretsService(readEnvironmentSecrets(options.environment ?? {}), new AbsentKeychain()));
  const accounts = new AccountStore(platformRoot);
  const healthReader = new HealthReader(platformRoot);
  const statusReader = new PlatformStatusReader(modes, new GateStore(platformRoot), accounts, healthReader, credentials);
  const vault = options.vault ?? new InMemoryPlatformTokenVault();
  const states = new InMemoryOAuthStateStore();
  const tokenLock = new TokenLock(platformRoot, clock, options.pid ?? process.pid);
  const queue = new PlatformWriteQueue();
  const attempts = new PublicationAttemptRepository(prisma);
  const publishFiles = new PublishFileReader(platformRoot);
  const views = new PlatformViewReader(statusReader, new PublicationTrackingReader(prisma, healthReader, clock));
  return {
    vault,
    states,
    attempts,
    start: new StartConnectionHandler(clock, clients, states, statusReader, credentials),
    complete: new CompleteConnectionHandler(platformRoot, clock, modes, clients, states, vault, credentials, tokenLock, queue),
    disconnect: new DisconnectHandler(platformRoot, clock, modes, clients, vault, accounts, credentials, tokenLock, queue, views),
    requestPublish: new RequestPublishHandler(
      platformRoot,
      clock,
      statusReader,
      new RunPublishFacts(prisma, dataHome),
      new RunBiometricAssets(prisma),
      attempts,
      publishFiles,
    ),
    cancelPublish: new CancelPublishHandler(platformRoot, attempts, publishFiles),
    syncAttempts: new SyncPublishAttemptsHandler(clock, prisma, attempts, publishFiles, new PublicationLinker(clients, accounts), queue, dataHome),
  };
}
