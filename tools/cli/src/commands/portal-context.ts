import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InstallPairingModule, InstallPairingUseCase } from '@studio/core/install';
import { DataHome, PathsModule } from '@studio/core/paths';
import { RedactionModule, RedactorService } from '@studio/core/redaction';
import { CliLogger } from '../logging/cli-logger.js';

/**
 * The smallest graph `studio portal pair|disconnect` needs: the shared pairing module (plan 9.1,
 * `@studio/core/install`) over core Prisma, plus redaction so log lines reach `cli.log` as every
 * other command's do. The pairing use case logs outcomes and counts only, never a code or token.
 */
@Module({ imports: [PathsModule, RedactionModule, InstallPairingModule] })
class CliPortalModule {}

/**
 * Boots `CliPortalModule`, runs `work` with the pairing use case, then flushes the log and closes,
 * in the same order as `withCliContext`. A boot failure (no database, no migration) propagates to
 * the command boundary unchanged.
 */
export async function withPortalPairing<T>(work: (pairing: InstallPairingUseCase) => Promise<T>): Promise<T> {
  const logger = new CliLogger();
  let app: INestApplicationContext;
  try {
    // `abortOnError: false`: a boot failure is thrown here, never `process.abort()`.
    app = await NestFactory.createApplicationContext(CliPortalModule, { logger, abortOnError: false });
  } catch (error) {
    await logger.close();
    throw error;
  }
  try {
    await logger.attach(app.get(RedactorService), app.get(DataHome).logs);
    return await work(app.get(InstallPairingUseCase));
  } finally {
    await logger.close();
    await app.close();
  }
}
