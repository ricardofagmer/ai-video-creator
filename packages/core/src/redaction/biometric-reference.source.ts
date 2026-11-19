import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Registered by-reference biometric paths (PRD 12, ADR 0003 decision 2). A port so the redactor
 * does not depend on catalog internals; the paths are read as strings from SQLite only, and no
 * file under them is ever opened, listed or hashed here.
 */
export interface BiometricReferenceSource {
  listBiometricReferencePaths(): Promise<readonly string[]>;
}

export const BIOMETRIC_REFERENCE_SOURCE = Symbol('BIOMETRIC_REFERENCE_SOURCE');

/** Far above the handful of voice and avatar folders the owner registers; past it, fail closed. */
export const MAX_BIOMETRIC_REFERENCES = 1000;

export class BiometricReferenceLimitError extends Error {
  readonly category = 'internal';

  constructor() {
    super(`More than ${MAX_BIOMETRIC_REFERENCES} biometric references are registered`);
    this.name = 'BiometricReferenceLimitError';
  }
}

/** Reads `asset_versions.reference_path` where `sensitivity = 'biometric'` (C8); read-only. */
@Injectable()
export class PrismaBiometricReferenceSource implements BiometricReferenceSource {
  constructor(private readonly prisma: PrismaService) {}

  async listBiometricReferencePaths(): Promise<readonly string[]> {
    const rows = await this.prisma.assetVersion.findMany({
      where: { sensitivity: 'biometric', referencePath: { not: null } },
      select: { referencePath: true },
      distinct: ['referencePath'],
      take: MAX_BIOMETRIC_REFERENCES + 1,
    });
    if (rows.length > MAX_BIOMETRIC_REFERENCES) throw new BiometricReferenceLimitError();
    const paths: string[] = [];
    for (const row of rows) if (row.referencePath !== null) paths.push(row.referencePath);
    return paths;
  }
}
