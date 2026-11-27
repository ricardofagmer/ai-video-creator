import { Inject, Injectable, Logger } from '@nestjs/common';
import { INSTALL_CLOCK, InstallCredentialsRepository, type InstallClock } from '@studio/core/install';
import { PrismaService } from '@studio/core/prisma';
import {
  INSTALL_CONTRACT_VERSION,
  INSTALL_PRODUCT,
  InstallPresenceSchema,
  InstallStatusSchema,
  PASSPHRASE_HASH_SETTING_KEY,
  type ComponentState,
  type InstallComponents,
  type InstallPresence,
  type InstallStatus,
} from '@studio/shared/api';
import { type z } from 'zod';
import { ResponseContractViolationError } from '../platform/api.errors';
import { InstallIdentity } from './install-identity';
import { CaptureBrowserProbe } from './probes/capture-browser.probe';
import { DataHomeProbe } from './probes/data-home.probe';
import { DatabaseProbe } from './probes/database.probe';
import { FfmpegProbe } from './probes/ffmpeg.probe';
import { SearchModelProbe } from './probes/search-model.probe';
import { WatcherProbe } from './probes/watcher.probe';
import { WebProbe } from './probes/web.probe';

type ProbedComponent = Exclude<keyof InstallComponents, 'api'>;

/**
 * Setup is complete once the steps that leave durable state did: the data home exists, the
 * database answers (migrations applied) and the passphrase hash is stored. Running services are
 * component states, not setup.
 */
export function setupStateOf(components: InstallComponents, passphraseConfigured: boolean): InstallStatus['setup'] {
  return components.dataHome === 'ok' && components.database === 'ok' && passphraseConfigured ? 'complete' : 'pending';
}

/**
 * Presence and status of C1. Each answer is parsed with its strict schema before it leaves, so no
 * field outside the contract (a path, a name, a port) can be added by mistake (DI-AC-07, DI-AC-13).
 * A probe that throws reads `degraded`; only its error name is logged.
 */
@Injectable()
export class InstallStatusService {
  private readonly logger = new Logger(InstallStatusService.name);

  constructor(
    private readonly identity: InstallIdentity,
    private readonly credentials: InstallCredentialsRepository,
    private readonly prisma: PrismaService,
    private readonly web: WebProbe,
    private readonly watcher: WatcherProbe,
    private readonly database: DatabaseProbe,
    private readonly ffmpeg: FfmpegProbe,
    private readonly searchModel: SearchModelProbe,
    private readonly captureBrowser: CaptureBrowserProbe,
    private readonly dataHome: DataHomeProbe,
    @Inject(INSTALL_CLOCK) private readonly clock: InstallClock,
  ) {}

  async presence(): Promise<InstallPresence> {
    const presence: InstallPresence = {
      product: INSTALL_PRODUCT,
      contract: INSTALL_CONTRACT_VERSION,
      version: await this.identity.installedVersion(),
      platform: this.identity.platform(),
      paired: await this.paired(),
    };
    return this.conform(InstallPresenceSchema, presence, 'InstallPresence');
  }

  async status(): Promise<InstallStatus> {
    const [web, watcher, database, ffmpeg, searchModel, captureBrowser, dataHome] = await Promise.all([
      this.safely('web', () => this.web.probe()),
      this.safely('watcher', () => this.watcher.probe()),
      this.safely('database', () => this.database.probe()),
      this.safely('ffmpeg', () => this.ffmpeg.probe()),
      this.safely('searchModel', () => this.searchModel.probe()),
      this.safely('captureBrowser', () => this.captureBrowser.probe()),
      this.safely('dataHome', () => this.dataHome.probe()),
    ]);
    const components: InstallComponents = { api: 'ok', web, watcher, database, ffmpeg, searchModel, captureBrowser, dataHome };
    const passphraseConfigured = database === 'ok' && (await this.passphraseConfigured());
    const status: InstallStatus = {
      contract: INSTALL_CONTRACT_VERSION,
      version: await this.identity.installedVersion(),
      platform: this.identity.platform(),
      checkedAt: this.clock.now().toISOString(),
      components,
      setup: setupStateOf(components, passphraseConfigured),
    };
    return this.conform(InstallStatusSchema, status, 'InstallStatus');
  }

  /** A database that cannot answer yet (first run, before migrations) reads as not paired. */
  private async paired(): Promise<boolean> {
    try {
      return await this.credentials.hasAnyToken();
    } catch (error) {
      this.logger.warn({ event: 'install.tokens-unreadable', errorName: error instanceof Error ? error.name : 'unknown' });
      return false;
    }
  }

  private async passphraseConfigured(): Promise<boolean> {
    try {
      return (await this.prisma.setting.count({ where: { key: PASSPHRASE_HASH_SETTING_KEY } })) > 0;
    } catch (error) {
      this.logger.warn({ event: 'install.settings-unreadable', errorName: error instanceof Error ? error.name : 'unknown' });
      return false;
    }
  }

  private async safely(component: ProbedComponent, probe: () => Promise<ComponentState>): Promise<ComponentState> {
    try {
      return await probe();
    } catch (error) {
      this.logger.warn({ event: 'install.probe-failed', component, errorName: error instanceof Error ? error.name : 'unknown' });
      return 'degraded';
    }
  }

  private conform<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown, viewName: string): z.output<Schema> {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const paths = parsed.error.issues.slice(0, 20).map((issue) => issue.path.join('.').slice(0, 200));
    this.logger.error({ event: 'install.response-contract-violated', view: viewName, paths });
    throw new ResponseContractViolationError(viewName);
  }
}
