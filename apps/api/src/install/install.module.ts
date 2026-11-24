import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { InstallPairingModule } from '@studio/core/install';
import { PathsModule } from '@studio/core/paths';
import { PrismaModule } from '@studio/core/prisma';
import { WatcherStatusReader } from '../watcher/watcher-status.reader';
import { PairThrottle } from './credentials/pair-throttle';
import { InstallController } from './install.controller';
import { INSTALL_API_PACKAGE_DIRECTORY, InstallIdentity, defaultApiPackageDirectory } from './install-identity';
import { InstallPairingService } from './install-pairing.service';
import { INSTALL_HOME_DIRECTORY, systemHomeDirectory } from './install-runtime';
import { InstallStatusService } from './install-status.service';
import { InstallTokenGuard } from './install-token.guard';
import { CaptureBrowserProbe } from './probes/capture-browser.probe';
import { DataHomeProbe } from './probes/data-home.probe';
import { DatabaseProbe } from './probes/database.probe';
import { FfmpegProbe } from './probes/ffmpeg.probe';
import { PROBE_PROCESS_RUNNER, execFileProcessRunner } from './probes/process-runner';
import { SearchModelProbe } from './probes/search-model.probe';
import { WatcherProbe } from './probes/watcher.probe';
import { LOOPBACK_HTTP_PROBER, WebProbe, fetchLoopbackHttpProber } from './probes/web.probe';

/**
 * Desktop installer api surface (plan C1 rev 1, ADR 0010 decisions 6 and 7): presence, pairing and
 * component status for the hosted portal. Credentials, the clock and the random source come from
 * core's `InstallPairingModule`, which the CLI shares; the home folder, process runner and HTTP
 * prober are injected here so tests bind fixed ones. `InstallBoundaryMiddleware` is applied by
 * the composition root, which owns middleware order. The search model probe uses the query
 * handler the embeddings api module registers on the root bus.
 */
@Module({
  imports: [CqrsModule, PrismaModule, PathsModule, InstallPairingModule],
  controllers: [InstallController],
  providers: [
    { provide: INSTALL_HOME_DIRECTORY, useFactory: (): string => systemHomeDirectory() },
    { provide: INSTALL_API_PACKAGE_DIRECTORY, useFactory: (): string => defaultApiPackageDirectory() },
    { provide: PROBE_PROCESS_RUNNER, useValue: execFileProcessRunner },
    { provide: LOOPBACK_HTTP_PROBER, useValue: fetchLoopbackHttpProber },
    PairThrottle,
    InstallPairingService,
    InstallIdentity,
    InstallTokenGuard,
    InstallStatusService,
    WatcherStatusReader,
    WebProbe,
    WatcherProbe,
    DatabaseProbe,
    FfmpegProbe,
    SearchModelProbe,
    CaptureBrowserProbe,
    DataHomeProbe,
  ],
})
export class InstallModule {}
