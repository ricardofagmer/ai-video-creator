import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { InstallCredentialsRepository, matchesAnyDigest, sha256Hex } from '@studio/core/install';
import { InstallTokenSchema } from '@studio/shared/api';
import { type Request } from 'express';
import { InstallUnauthorizedError } from './install.errors';

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** The token from `Authorization: Bearer <token>`, or null when absent or of the wrong shape. */
export function bearerTokenFrom(header: string | undefined): string | null {
  if (header === undefined) return null;
  const token = BEARER_PATTERN.exec(header)?.[1];
  if (token === undefined) return null;
  return InstallTokenSchema.safeParse(token).success ? token : null;
}

/**
 * Guards `GET /install/status` (C1, DI-AC-10). The presented token is hashed and compared in
 * constant time against every stored digest; a missing, malformed or unknown token is the same
 * `InstallUnauthorizedError`, answered 401 with no body. The token is never logged.
 */
@Injectable()
export class InstallTokenGuard implements CanActivate {
  constructor(private readonly credentials: InstallCredentialsRepository) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const request = execution.switchToHttp().getRequest<Request>();
    const token = bearerTokenFrom(request.headers.authorization);
    const digests = await this.credentials.tokenDigests();
    // Hashed and compared even without a usable token, so both paths do the same work.
    const valid = matchesAnyDigest(sha256Hex(token ?? ''), digests);
    if (token === null || !valid) throw new InstallUnauthorizedError();
    return true;
  }
}
