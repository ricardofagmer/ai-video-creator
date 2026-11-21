import { Injectable, Logger } from '@nestjs/common';
import { type Platform } from '@studio/shared/platforms';
import { type PlatformClientSecretName } from '../secrets/secret-names';
import { SecretsError } from '../secrets/secrets.errors';
import { SecretsService } from '../secrets/secrets.service';
import { type PlatformClientCredentials } from './clients/platform-client.port';

/** Section 5.2: the two client credential names of each platform. */
const credentialNames: Readonly<Record<Platform, { clientId: PlatformClientSecretName; clientSecret: PlatformClientSecretName }>> =
  Object.freeze({
    youtube: { clientId: 'youtube-oauth-client-id', clientSecret: 'youtube-oauth-client-secret' },
    instagram: { clientId: 'instagram-app-id', clientSecret: 'instagram-app-secret' },
    tiktok: { clientId: 'tiktok-client-key', clientSecret: 'tiktok-client-secret' },
  });

/** `present`: both credentials resolved. `missing`: at least one is absent or unreadable. */
export type CredentialsLookup = { status: 'present'; credentials: PlatformClientCredentials } | { status: 'missing' };

/**
 * The OAuth client credentials of a platform (SPEC 0007 section 5.2): environment first, then the
 * provider-keys Keychain service, through `SecretsService`. Never a literal or a default. A
 * credential that is missing, malformed or unreadable answers `missing`, which gives the status
 * `not-configured` in live mode; the log names the secret and the failure class only.
 */
@Injectable()
export class PlatformCredentials {
  private readonly logger = new Logger(PlatformCredentials.name);

  constructor(private readonly secrets: SecretsService) {}

  async lookup(platform: Platform): Promise<CredentialsLookup> {
    const names = credentialNames[platform];
    const clientId = await this.resolve(platform, names.clientId);
    if (clientId === null) return { status: 'missing' };
    const clientSecret = await this.resolve(platform, names.clientSecret);
    if (clientSecret === null) return { status: 'missing' };
    return { status: 'present', credentials: { clientId, clientSecret } };
  }

  async isConfigured(platform: Platform): Promise<boolean> {
    return (await this.lookup(platform)).status === 'present';
  }

  private async resolve(platform: Platform, name: PlatformClientSecretName): Promise<PlatformClientCredentials['clientId'] | null> {
    try {
      const lookup = await this.secrets.resolve(name);
      return lookup.status === 'present' ? lookup.secret : null;
    } catch (error) {
      if (!(error instanceof SecretsError)) throw error;
      this.logger.warn({ event: 'platform.credentials-unavailable', platform, secretName: name, errorName: error.name });
      return null;
    }
  }
}
