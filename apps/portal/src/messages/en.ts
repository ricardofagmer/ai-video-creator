import type { Messages } from '@studio/ui';
import type { portalPtBR } from './pt-BR';

export const portalEn: Messages<typeof portalPtBR> = {
  header: {
    tagline: 'Download the studio and follow its installation on this computer.',
    languageLabel: 'Language',
  },
  detection: {
    heading: 'Studio on this computer',
    checking: 'Looking for the studio on this computer…',
    checkAgain: 'Check again',
    openStudio: 'Open studio',
    loopbackBlocked: {
      title: 'This browser does not let the page talk to the studio',
      body: 'Safari blocks, by design, requests from a web page to apps on this computer. Nothing is wrong: open the studio with the link below, or use Chrome, Edge or Firefox to see its version and state here.',
    },
    permissionPrompt: {
      title: 'Allow access to apps on this computer',
      body: 'Your browser is asking whether this page may talk to apps on this computer. Choose Allow to see the state of the studio. The page only talks to 127.0.0.1, this computer itself.',
    },
    permissionDenied: {
      title: 'Access to apps on this computer is blocked',
      body: 'Click the site settings icon to the left of the address, set "Loopback network" (or "Apps on this device") to Allow, then check again.',
    },
    notInstalled: {
      title: 'Studio not found on this computer',
      body: 'Download the installer below. If the studio is already installed, open the app and check again. If your browser asked about apps on this computer, choose Allow.',
    },
    unpaired: {
      title: 'Studio installed',
      body: 'To see the state of each part, connect this page: in the studio menu, choose "Connect to portal".',
      pairing: 'Connecting this page to the studio…',
      rejected: 'The connection code expired or was already used. In the studio menu, choose "Connect to portal" again.',
    },
    paired: {
      title: 'Studio installed and connected',
      waitingStatus: 'Reading the state of each part…',
      componentsHeading: 'Parts of the studio',
      setupPending: 'First-run setup has not finished. Open the studio to complete it.',
    },
    unknownContract: {
      title: 'Update the studio',
      body: 'The studio on this computer answered in a format this page does not know. Download the latest version below.',
    },
    facts: {
      version: 'Version',
      platform: 'Platform',
      checkedAt: 'Checked at',
    },
    components: {
      api: 'Local service',
      web: 'Interface',
      watcher: 'Runner',
      database: 'Database',
      ffmpeg: 'FFmpeg',
      searchModel: 'Search model (optional)',
      captureBrowser: 'Capture browser (optional)',
      dataHome: 'Data folder',
    },
    componentStates: {
      ok: 'Working',
      missing: 'Missing',
      stopped: 'Stopped',
      degraded: 'Degraded',
      'not-installed': 'Not installed',
    },
    platforms: {
      'darwin-arm64': 'macOS (Apple Silicon)',
      'win32-x64': 'Windows (x64)',
    },
  },
  update: {
    title: 'Update available',
    body: (installed, latest) => `You have version ${installed}. Version ${latest} is available.`,
    download: 'Download the update',
  },
  downloads: {
    heading: 'Download',
    loading: 'Reading the latest version…',
    notConfigured: {
      title: 'Release address not configured',
      body: 'This deployment of the portal does not know where to read the latest version. Whoever maintains the portal needs to set the latest.json address.',
    },
    failed: {
      title: 'Could not read the latest version',
      body: 'Try again in a few minutes.',
    },
    release: (version) => `Version ${version}`,
    publishedAt: 'Published on',
    macos: {
      title: 'macOS',
      requirement: 'For Macs with Apple Silicon (M1 or newer).',
      download: 'Download for macOS (.dmg)',
      notPublished: 'The installer has not been published yet. This button turns on when the first version is out.',
    },
    windows: {
      title: 'Windows',
      comingNext: 'Coming next. The Windows version is the next step.',
    },
    otherSystem: 'The studio runs on Mac computers with Apple Silicon. Open this page on the computer you will install it on.',
    missingAsset: 'This version has no installer for this platform.',
    size: 'Size',
    file: 'File',
    sha256: 'SHA-256',
    sha256Hint: 'Check it in Terminal with: shasum -a 256 <file>',
    ffmpeg: {
      title: 'FFmpeg source code',
      body: (licence) => `The studio includes FFmpeg, distributed under the ${licence} licence. The corresponding source code comes with every version.`,
      link: 'Download the FFmpeg source code',
      missing: 'The FFmpeg source code is not listed for this version.',
    },
    gatekeeper: {
      title: 'First launch on a Mac',
      intro: 'The app is not notarized by Apple, so macOS asks for a confirmation the first time.',
      steps: {
        drag: 'Open the .dmg file and drag the app to Applications.',
        firstOpen: 'Double-click the app in Applications. macOS refuses to open it: close the dialog without choosing Move to Trash.',
        settings: 'Within one hour, choose Apple menu > System Settings > Privacy & Security (scroll down if needed). Under Security, click Open Anyway.',
        password: 'Enter your login password, then click OK.',
        later: 'From then on the app opens without asking.',
      },
    },
  },
  footer: {
    privacy: 'This page uses no cookies and no analytics. The state of the studio is read from 127.0.0.1 and never leaves this computer.',
  },
};
