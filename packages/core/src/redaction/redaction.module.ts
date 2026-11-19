import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SecretsModule } from '../secrets/secrets.module';
import { BIOMETRIC_REFERENCE_SOURCE, PrismaBiometricReferenceSource } from './biometric-reference.source';
import { RedactorService } from './redactor.service';

/**
 * Redaction (R1-11). Biometric paths are read from SQLite read-only, so the watcher may import
 * this module (ADR 0003). A composition root can rebind `BIOMETRIC_REFERENCE_SOURCE`.
 */
@Module({
  imports: [PrismaModule, SecretsModule],
  providers: [{ provide: BIOMETRIC_REFERENCE_SOURCE, useClass: PrismaBiometricReferenceSource }, RedactorService],
  exports: [RedactorService],
})
export class RedactionModule {}
