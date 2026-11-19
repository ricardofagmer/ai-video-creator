import { Controller, Get, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@studio/core/prisma';
import { apiRouteSegments, type HealthResponse } from '@studio/shared/api';
import { Public } from '../auth/auth.decorators';

/** Readiness reflects the one real dependency, SQLite (rules/observability.md). */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    try {
      // A constant tagged-template query: Prisma binds it; no input reaches it.
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok' };
    } catch (error) {
      this.logger.warn({ event: 'health.database-unavailable', errorName: error instanceof Error ? error.name : 'unknown' });
      return { status: 'degraded', database: 'unavailable' };
    }
  }
}

/**
 * One of the two public routes (criterion 27). It reveals liveness and database reachability
 * only, which `studio doctor` needs (criterion 1) before any login.
 */
@Public()
@Controller(apiRouteSegments.health)
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
