import { Global, Module } from '@nestjs/common';
import { PathsModule } from '@studio/core/paths';
import { RedactionModule } from '@studio/core/redaction';
import { ApiLogger } from '../logging/api-logger';
import { ApiConfig, readApiConfig } from './api-config';
import { RequestContext } from './request-context';

/**
 * Cross-cutting providers of the api process. The environment is read once, here, when the
 * composition root builds the module graph (rules/architecture.md "Configuration").
 */
@Global()
@Module({
  imports: [PathsModule, RedactionModule],
  providers: [{ provide: ApiConfig, useFactory: (): ApiConfig => readApiConfig(process.env) }, RequestContext, ApiLogger],
  exports: [ApiConfig, RequestContext, ApiLogger],
})
export class PlatformModule {}
