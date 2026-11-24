import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { type Response } from 'express';
import { RequestContext } from '../platform/request-context';
import { InstallPlatformUnsupportedError, InstallUnauthorizedError } from './install.errors';

type InstallRefusal = InstallUnauthorizedError | InstallPlatformUnsupportedError;

/**
 * C1 rev 2 answers with no body fields, so a cross-origin page learns only the status: a refused
 * pair or status request is 401, a platform outside C1's list is 503. Every other error of the
 * install routes reaches the global filter.
 */
@Catch(InstallUnauthorizedError, InstallPlatformUnsupportedError)
export class InstallRefusalFilter implements ExceptionFilter<InstallRefusal> {
  private readonly logger = new Logger(InstallRefusalFilter.name);
  // The platform never changes while the process runs, so one log line says all there is to say.
  private platformRefusalLogged = false;

  constructor(private readonly context: RequestContext) {}

  catch(exception: InstallRefusal, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof InstallPlatformUnsupportedError) {
      if (!this.platformRefusalLogged) {
        this.platformRefusalLogged = true;
        this.logger.error({ event: 'install.platform-unsupported', errorName: exception.name });
      }
      response.status(503).end();
      return;
    }
    this.logger.warn({ event: 'install.request-unauthorized', correlationId: this.context.correlationId() });
    response.status(401).end();
  }
}
