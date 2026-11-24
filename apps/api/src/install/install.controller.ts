import { Body, Controller, Get, HttpCode, Post, UseFilters, UseGuards } from '@nestjs/common';
import { apiRouteSegments, type InstallPairing, type InstallPresence, type InstallStatus } from '@studio/shared/api';
import { Public } from '../auth/auth.decorators';
import { InstallPairingService } from './install-pairing.service';
import { InstallStatusService } from './install-status.service';
import { InstallTokenGuard } from './install-token.guard';
import { InstallRefusalFilter } from './install-refusal.filter';

/**
 * Contract C1 (desktop installer, ADR 0010 decisions 6 and 7). Outside the session guard by design:
 * the hosted portal holds no studio session. ADR 0010 amends criterion 27 for these three routes:
 * presence is public, pair needs the one-time code, status needs a portal token
 * (`InstallTokenGuard`). Host, CORS and Origin rules are `InstallBoundaryMiddleware`.
 */
@Public()
@UseFilters(InstallRefusalFilter)
@Controller(apiRouteSegments.install)
export class InstallController {
  constructor(
    private readonly statusService: InstallStatusService,
    private readonly pairing: InstallPairingService,
  ) {}

  @Get(apiRouteSegments.installPresence)
  presence(): Promise<InstallPresence> {
    return this.statusService.presence();
  }

  /** The body is validated inside the service: every malformed body is a failed attempt (401). Never logged. */
  @Post(apiRouteSegments.installPair)
  @HttpCode(200)
  pair(@Body() body: unknown): Promise<InstallPairing> {
    return this.pairing.pair(body);
  }

  @Get(apiRouteSegments.installStatus)
  @UseGuards(InstallTokenGuard)
  status(): Promise<InstallStatus> {
    return this.statusService.status();
  }
}
