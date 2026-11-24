# 0010. Ship a self-contained desktop app in a downloadable installer, and add a hosted portal that reads install status from the local api

Date: 2026-11-23
Status: accepted (owner, 2026-11-23, "Approve design").

Decider: Ricardo Fagmer. Sources: the owner's request and answers of 2026-11-23 (recorded in
`.engineos/changes/2026-11-23-desktop-installer.md` under Human decisions); PRD
`docs/prds/2026-11-23-desktop-installer.md`; PRD 0001 sections 11 and 12; ADR 0001, ADR 0005;
`scripts/install.sh`; `apps/api/src/main.ts`; `apps/shell/`; the code read at `0060c10`.

Statements marked **Unverified** were not confirmed against vendor documentation in this pass
and must be checked in a vetting report (`docs/vetting/0006-installer-and-portal.md`) before
the ticket that depends on them starts.

## Context

- Install today is `scripts/install.sh`: Homebrew, Node 22, pnpm, a workspace build, launchd,
  an optional locally built Electron menu-bar app copied to `~/Applications` (**Fact**).
- The studio runs from the source checkout: the launchd plist, the `studio` symlink and the
  shell's `shell-config.json` all hold absolute paths into the repository and to Homebrew's
  node (**Fact**, `install.sh` steps 11 to 13).
- ADR 0005 chose a thin shell with no bundled runtime, no Developer ID, no notarization, no
  auto-update, for one Mac.
- PRD 0001 section 12 says local only: web and api bind to `127.0.0.1`, no remote access.
- The owner now wants a downloaded installer for macOS and Windows and a web that knows when
  the studio is installed and stays in sync with the computer.

Forces: no Terminal for the user; the data never leaves the computer; no paid certificates
yet; Windows cannot be verified on the development Mac; the loopback-only api is a security
property worth keeping.

## Decision

Owner choices of 2026-11-23 are marked **(D)**.

1. **Self-contained app.** The Electron shell becomes the product's container. Its
   `Resources/runtime/` folder (outside the asar) carries a pinned Node binary, static
   `ffmpeg` and `ffprobe`, and a staged production payload: api, web (Next standalone
   output), watcher, CLI and their production `node_modules` including native modules
   (Prisma engine, `onnxruntime-node`, `@node-rs/argon2`). Every path the studio uses is
   resolved from the app's own location, never from a repository or Homebrew.
2. **First-run setup inside the app** replaces `install.sh` steps 6 to 15. Each step checks
   state first and is safe to repeat. The search model and the Playwright browser stay
   optional downloads that ask first.
3. **Installer format.** macOS: a `.dmg` built with the system `hdiutil` (no new
   dependency), app signed ad hoc with every nested binary signed. Windows (phase 2): a
   per-user installer; its tool is chosen in the phase 2 vetting.
4. **Unsigned for now (D).** No Developer ID, no notarization, no Windows certificate. The
   user accepts the Gatekeeper or SmartScreen step by hand; the portal documents it.
5. **Hosted portal, status only (D).** A new static Next.js app, `apps/portal`, deployed to
   Vercel. It offers downloads and shows status. It has no server-side state and no
   analytics.
6. **Browser to local agent (D).** The portal page calls the local api on `127.0.0.1` from
   the browser. The api adds an `install` module with three routes and accepts exactly one
   cross-origin caller, the configured portal origin, on those routes only. The listener
   stays bound to `127.0.0.1`.
7. **Pairing.** The app's menu item "Connect to portal" issues a one-time code (5 minutes,
   single use) and opens the portal with the code in the URL fragment, which browsers do not
   send to servers. The page exchanges it at the local api for a random 256-bit token kept in
   the browser's storage for the portal origin; the api stores only the token's SHA-256.
   Presence and version are public; health needs the token. The app can revoke all tokens.
8. **Releases (D).** A CI workflow on a `v*` tag builds the installers, computes SHA-256 and
   publishes them with `latest.json` to GitHub Releases. The portal reads `latest.json`.
9. **No auto-update.** The portal and the app compare the installed version with
   `latest.json` and link to the download. Unchanged from ADR 0005.
10. **Mac first, Windows second (D).** One status contract for both; Windows is a second
    frontier with its own vetting and a real-machine verification.
11. `scripts/install.sh` stays as the development install from source.

## Alternatives considered

| # | Alternative | Why not |
|---|---|---|
| A | Keep the script, wrap it in a double-clickable `.command` or `.pkg` | Still needs Homebrew, a build and the repository on the user's machine; no Windows path. |
| B | Local web only, no hosted page (the recommended option the owner did not take) | Simplest and keeps PRD 12 intact, but there is nowhere to download from or see status before the studio is installed. |
| C | Cloud relay: the agent reports status outbound to a hosted api | Works from any device and browser, but needs accounts, a hosted database and sends status off the computer. Rejected by the owner in favour of 6. |
| D | Host the whole studio web | Cross-origin login and every api call would need rework, and the studio would stop when the site is unreachable. Rejected by the owner in favour of 5. |
| E | Signed and notarized installers now | No warnings, but needs paid memberships and CI secrets. Deferred by the owner. |
| F | `.pkg` on macOS | Can run scripts and place launchd files, but an unsigned `.pkg` is blocked harder than an unsigned app in a `.dmg`, and it hides the first-run steps from the user. |
| G | A third-party installer builder for both platforms | One tool for dmg and Windows, but a new build dependency to vet; the Mac needs only `hdiutil`. Reconsidered in the phase 2 vetting. |

## Consequences

Positive:

- Install is download, open, follow the setup. No Terminal.
- The studio no longer depends on the source checkout or on Homebrew upgrades.
- One status contract serves the portal, the app's menu and `studio doctor`.
- The data, the catalog and the keys still never leave the computer.

Negative, accepted:

- **PRD 0001 section 12 is amended**: a public origin may now read install status from the
  local api through the user's browser. The listener is still loopback only.
- The app grows from a thin shell to a bundle with Node, ffmpeg and dependencies. ADR 0005's
  400 MB bundle trigger will be exceeded and is re-measured (**Unverified** size).
- Unsigned downloads carry the quarantine flag: macOS shows "cannot be opened" until the user
  allows it in System Settings; Windows shows SmartScreen (**Unverified** exact steps per OS
  version).
- The portal's status view works only in a browser on the same computer. **Unverified**:
  Chrome asks a local network permission; Safari may block `http://127.0.0.1` from an HTTPS
  page. Where blocked, the portal says so and offers "Open studio" instead.
- A new attack surface: a web origin talking to the local api. Mitigations are requirements,
  not options: exact-origin CORS, `Host` header check against DNS rebinding, GET and one
  POST only, no cookies, token in an `Authorization` header, constant-time comparison,
  throttled pairing, no paths or identifiers in any payload.
- Shipping ffmpeg and Node makes this project a redistributor: their licences must be
  included (**Unverified** which ffmpeg build and licence; vetting 0006).
- Two release artefacts and a CI workflow with `contents: write` to maintain.

## Supersedes and amends

- ADR 0005: decision points "installed by `scripts/install.sh` into `~/Applications`", "the
  shell spawns Homebrew's node" and "built locally only" are superseded by 1 to 3 here. Its
  security posture (fuses, no remote content in the shell window, no auto-update, watcher
  as a login agent) stands.
- PRD 0001 sections 11 and 12, as stated in the PRD of 2026-11-23.

## Revisit triggers

- Anyone other than the owner installs the studio: signing and notarization (alternative E).
- Status is wanted from a phone or another computer: cloud relay (alternative C).
- Safari support becomes required: a relay, or an HTTPS loopback listener with a local
  certificate.
- The installer exceeds 1 GB or first-run setup exceeds 5 minutes on the owner's Mac.

## Amendments (2026-11-23, after vetting 0006)

- The **Unverified** statements are resolved in `docs/vetting/0006-installer-and-portal.md`.
  Chrome 142+, Edge 143+ and Firefox 153+ allow the loopback call after a permission prompt;
  Safari blocks it as mixed content, so in Safari the portal offers the download and "Open
  studio" only.
- Decision 6: the api also answers the CORS `OPTIONS` preflight on the install routes.
- Decision 1: ffmpeg is the GPL arm64 build named in the vetting; the owner chose to bundle it and
  comply (GPL text in the app, matching source archive on every release). The studio runs ffmpeg
  as a separate program.
- Decision 1: the pinned runtime is Node v24.22.3 (darwin-arm64).
- Gatekeeper: the only path on current macOS is System Settings > Privacy & Security > Open
  Anyway. Setup refuses to run from a translocated or disk-image path.
- Size: about 0.4 to 0.6 GB to download and 0.9 to 1.2 GB installed (estimate). The 1 GB revisit
  trigger means the download.
- The packaged web must be started with `HOSTNAME=127.0.0.1`.

### Consequences for ADR 0005 found during implementation (2026-11-23)

The approved design changes three statements of ADR 0005 beyond the setup window. They are listed
here so the owner can confirm them at the final review; until then they are open, not superseded.

- R3-AC-25.7 (one `openExternal` call site): the portal link and the update line add call sites.
  Each opens `https:` addresses only, through one guard (`apps/shell/src/portal/external-url.ts`).
- R3-AC-25.8 (no outbound request): the shell fetches `latest.json` when the user opens the menu,
  never in the background.
- Section D (the passphrase is never in the shell): in the installed app the passphrase is typed
  in the setup window and handed to the CLI over stdin.

Also open: the `studio` CLI is not on PATH in an installed app, while setup text and key entry
(`studio doctor`, `studio secrets set`) still refer to it.
