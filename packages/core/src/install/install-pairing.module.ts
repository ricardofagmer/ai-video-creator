import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InstallCredentialsRepository } from './install-credentials.repository';
import { InstallPairingUseCase } from './install-pairing.use-case';
import { INSTALL_CLOCK, INSTALL_RANDOM_SOURCE, systemInstallClock, systemInstallRandomSource } from './install-runtime';

/**
 * Portal pairing credentials (ADR 0010 decision 7), shared by the api (pair and status routes) and
 * the CLI (issue a code, revoke every token) so neither imports the other. Binds the system clock
 * and random source; a test overrides `INSTALL_CLOCK` and `INSTALL_RANDOM_SOURCE`.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: INSTALL_CLOCK, useValue: systemInstallClock },
    { provide: INSTALL_RANDOM_SOURCE, useValue: systemInstallRandomSource },
    InstallCredentialsRepository,
    InstallPairingUseCase,
  ],
  exports: [INSTALL_CLOCK, INSTALL_RANDOM_SOURCE, InstallCredentialsRepository, InstallPairingUseCase],
})
export class InstallPairingModule {}
