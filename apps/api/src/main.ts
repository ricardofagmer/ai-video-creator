import 'reflect-metadata';
import { type AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DataHome, ensureDataHomeDirectories } from '@studio/core/paths';
import { AppModule } from './app.module';
import { ApiLogger } from './logging/api-logger';
import { ApiConfig, JSON_BODY_LIMIT } from './platform/api-config';

/**
 * Loopback only (A9, PRD 12): the listener is bound to this literal, never to a configurable
 * host, so no setting can expose the studio to the network.
 */
const LOOPBACK_HOST = '127.0.0.1';

class ListenerNotLoopbackError extends Error {
  constructor() {
    super('The api listener is not bound to the loopback address');
    this.name = 'ListenerNotLoopbackError';
  }
}

async function bootstrap(): Promise<void> {
  // The built-in body parser is off so the JSON limit below is the only one, and multipart
  // uploads reach busboy as a raw stream.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(ApiLogger));
  await ensureDataHomeDirectories(app.get(DataHome));
  app.disable('x-powered-by');
  // Nothing proxies the api; X-Forwarded-* headers must not change what the api believes.
  app.set('trust proxy', false);
  // No response carries an ETag, so no conditional request can be answered 304 (SPEC 0002 rev 4,
  // A25): nothing cached under one session can be revalidated under another.
  app.set('etag', false);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.enableShutdownHooks();
  const config = app.get(ApiConfig);
  await app.listen(config.port, LOOPBACK_HOST);
  const address: AddressInfo | string | null = app.getHttpServer().address();
  if (address === null || typeof address === 'string' || address.address !== LOOPBACK_HOST) {
    await app.close();
    throw new ListenerNotLoopbackError();
  }
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet; the error name alone carries no path, query or secret.
  process.stderr.write(`api failed to start: ${error instanceof Error ? error.name : 'UnknownError'}\n`);
  process.exitCode = 1;
});
