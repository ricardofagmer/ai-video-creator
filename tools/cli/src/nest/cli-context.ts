import { type DynamicModule, type INestApplicationContext, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EmbeddingIndexer } from '@studio/core/embeddings';
import { DataHome } from '@studio/core/paths';
import { PrismaService } from '@studio/core/prisma';
import { QualityScoreService } from '@studio/core/quality';
import { RedactorService } from '@studio/core/redaction';
import { CliLogger } from '../logging/cli-logger.js';
import { PassphraseHashRepository } from '../passphrase/passphrase-hash.repository.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { CliSearchModule } from './cli-search.module.js';
import { CliModule } from './cli.module.js';

/** What a command uses from the booted context; buses for writes and reads, nothing else injected. */
export interface CliContext {
  commandBus: CommandBus;
  queryBus: QueryBus;
  dataHome: DataHome;
  /** Read-only connectivity probe for `doctor`; commands never write through it. */
  prisma: PrismaService;
  passphraseHashes: PassphraseHashRepository;
  /** The single writer of the quality score columns; `studio catalog rescore` only (SPEC 0003 5.1). */
  qualityScores: QualityScoreService;
}

/**
 * The context of the commands that boot `CliSearchModule`. `embeddingIndexer` is the single writer
 * of the embedding columns (`studio catalog embed`); searches and index status go through
 * `queryBus` (`SemanticSearchQuery`, `GetSearchIndexStatusQuery`).
 */
export interface CliSearchContext extends CliContext {
  embeddingIndexer: EmbeddingIndexer;
}

/**
 * Boots `rootModule`, runs `work`, then closes everything in order: queued log lines first
 * (redaction reads biometric paths through Prisma), then the context. A boot failure (database
 * file missing, migrations absent) is thrown to the command boundary unchanged.
 */
async function withApplicationContext<T>(rootModule: Type<unknown> | DynamicModule, work: (app: INestApplicationContext, context: CliContext) => Promise<T>): Promise<T> {
  const logger = new CliLogger();
  let app: INestApplicationContext;
  try {
    // `abortOnError: false`: a boot failure is thrown here, never `process.abort()`.
    app = await NestFactory.createApplicationContext(rootModule, { logger, abortOnError: false });
  } catch (error) {
    await logger.close();
    throw error;
  }
  try {
    const dataHome = app.get(DataHome);
    await logger.attach(app.get(RedactorService), dataHome.logs);
    return await work(app, {
      commandBus: app.get(CommandBus),
      queryBus: app.get(QueryBus),
      dataHome,
      prisma: app.get(PrismaService),
      passphraseHashes: app.get(PassphraseHashRepository),
      qualityScores: app.get(QualityScoreService),
    });
  } finally {
    await logger.close();
    await app.close();
  }
}

/** The CLI module graph without the embeddings module; every command except the search ones. */
export async function withCliContext<T>(work: (context: CliContext) => Promise<T>): Promise<T> {
  return withApplicationContext(CliModule, (_app, context) => work(context));
}

/** The CLI module graph plus the embeddings module, for the commands that index or search by meaning. */
export async function withSearchContext<T>(settings: Pick<CliSettings, 'runtime'>, work: (context: CliSearchContext) => Promise<T>): Promise<T> {
  return withApplicationContext(CliSearchModule.forRuntime(settings.runtime), (app, context) => work({ ...context, embeddingIndexer: app.get(EmbeddingIndexer) }));
}
