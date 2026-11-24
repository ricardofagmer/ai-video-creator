import type { Messages } from '@studio/ui';
import type { platformsPtBR } from './pt-BR';

export const platformsEn: Messages<typeof platformsPtBR> = {
  page: {
    title: 'Accounts',
    description:
      'Your YouTube, Instagram and TikTok accounts. You enable each platform separately, after it approves the app; the studio only publishes when you click Publish on an approved run.',
    loadFailed: (detail) => `Could not load the accounts. ${detail}`,
  },
  capabilityStatus: {
    unsupported: 'Publish in the app and paste the link',
    'awaiting-review': 'Awaiting platform review',
    'not-configured': 'App not configured',
    disconnected: 'Account not connected',
    'needs-reconnect': 'Reconnect the account',
    connected: 'Connected',
  },
  capabilities: {
    metrics: 'Metrics',
    publish: 'Publishing',
  },
  mockMode: 'Simulated mode: nothing will be sent.',
  mockBadge: 'simulated',
  importFallback: 'The CSV import and the form are still available.',
  importLink: 'Import metrics from a CSV',
  reconnectReasons: {
    'token-revoked': "The studio's permission was revoked on the platform.",
    'refresh-expired': 'The authorization expired.',
    'scope-missing': 'The platform did not grant all the requested permissions.',
    'account-changed': 'The platform account changed since it was connected.',
    'token-missing': 'The authorization stored in the Keychain was not found.',
  },
  backoffReasons: {
    'rate-limited': 'request limit reached',
    'quota-exhausted': 'daily quota used up',
    'platform-unavailable': 'platform unavailable',
    network: 'no connection to the platform',
  },
  card: {
    account: 'Account',
    noAccount: 'No account connected',
    connectedAt: 'Connected on',
    lastPoll: 'Last collected',
    backoff: 'Collection paused',
    backoffValue: (reason, until) => `${reason}; retrying on ${until}`,
    publications: 'Publications',
    tracked: (count) => (count === 1 ? '1 tracked publication' : `${count} tracked publications`),
  },
  gate: {
    enable: (capability) => `Enable ${capability}`,
    enabledByYou: 'Enabled by you.',
    enableAfterReview: (platform) => `Turn it on only after ${platform} approves the app.`,
    confirmTitle: (capability, platform) => `Enable ${capability} on ${platform}?`,
    publishConsequence: (platform) => `The studio will be able to send videos to ${platform} when you click Publish.`,
    metricsConsequence: (platform) =>
      `The studio will start collecting the metrics of your ${platform} publications on its own, within the platform's free quota.`,
    cancel: 'Cancel',
    enabling: 'Enabling…',
    confirm: 'Enable',
  },
  connection: {
    connecting: 'Opening the platform…',
    connect: 'Connect',
    reconnect: 'Reconnect',
    disconnect: 'Disconnect',
    disconnectTitle: (platform) => `Disconnect ${platform}?`,
    disconnectDescription: (platform, fallback) =>
      `The studio deletes the access stored in the Keychain and stops collecting metrics and publishing on ${platform}. ${fallback}`,
    cancel: 'Cancel',
    disconnecting: 'Disconnecting…',
    revoked: (platform) => `The access stored in the studio was deleted and the ${platform} account confirmed the app's access was removed.`,
    notRevoked: (platform) =>
      `The access stored in the studio was deleted. To be sure, also remove the app's access in your ${platform} account settings.`,
    connected: 'Account connected.',
    connectedTo: (platform) => `${platform} account connected.`,
    failed: 'Could not complete the connection. Try again.',
  },
};
