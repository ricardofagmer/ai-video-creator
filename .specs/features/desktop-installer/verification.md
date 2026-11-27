# desktop-installer: verification record

Status: pending. No executable check has run. This file records decisions and evidence as they
are, not a pass.

## Final checkpoint (2026-11-23)

Scope: the uncommitted working tree on branch `chore/rename-change-record-followup`, tickets 00 to
08, 10 and 11 plus supervisor corrections, plan rev 3 with sections 9.1 to 9.4.

Question asked: run `pnpm install`, `pnpm --filter @studio/core exec prisma generate`,
`pnpm exec turbo run build`, `pnpm exec turbo run typecheck --filter='@studio/*'`,
`pnpm exec turbo run lint --filter='@studio/*'`, `pnpm exec turbo run test --filter='@studio/*'`.

Owner's answer: "Skip for now".

`[validation] pending — final-stage user approval required`

## Security review

Question asked: run the read-only `security-reviewer` on the integrated diff, no scans.
Owner's answer: "Decline security review". `security_review` stays `pending` in the change
record; the work is not security-verified.

## Independent critic

Not run. Required at risk high before the work is called done; it waits for the checks.

## Evidence that does exist (read-only inspection only)

- Every worker return was inspected against its scope and the frozen contracts by the supervisor.
- GitHub action pins for upload-artifact v4.6.2, download-artifact v4.3.0 and cache v4.2.3 were
  read from the GitHub API on 2026-11-23 and match the workflow.
- The FFmpeg 9.1 tarball checksum in `scripts/ffmpeg-build/sources.lock.json` was read from the
  Homebrew formula API on 2026-11-23 for the same URL.
- One syntax parse of `apps/shell/scripts/package-dmg.mjs` (`node --check`) by the ticket 11
  worker, before later supervisor edits to that file.

## Known open items

- No package has been built, type-checked, linted or tested. Workers reported several places they
  expect to fail: test fixtures missing `runtime` (`hyperframes-cli.harness.test.ts:85`,
  `__tests__/commands.test.ts:48` and its command-tree list, `platforms/platform-cli.harness.test.ts:213`),
  a possible `no-control-regex` lint failure in `apps/shell/src/setup/plist-render.ts`.
- The ffmpeg configure flags have never run.
- The database migration `20261123120000_install_pairing` is authored, not applied.
- The capture browser is not offered by the installed app.
- ADR 0005 statements R3-AC-25.7, R3-AC-25.8 (outbound request) and section D await the owner's
  confirmation (ADR 0010, last section).
- `InstallVersionUnavailableError` still surfaces as HTTP 500 when the version file is truly unreadable (the packaged-manifest cause is fixed, see the install test below).
- Acceptance DI-AC-01 to DI-AC-26: none has executed evidence; see `checks.md` for the plan.
- Phase 2 (Windows) is not started.

## Local build, 2026-11-23 (owner asked: "Yes, build it")

- `pnpm exec turbo run build`: 12 of 12 packages built, after one lint fix in `apps/web/src/features/catalog/template-categories.ts`.
- `scripts/ffmpeg-build/build-ffmpeg.sh`: FFmpeg 9.1 built after adding `--disable-decoder` to the LAME configure line. Needed `pkgconf` and `gnupg` from Homebrew (owner approved).
- `pnpm --filter @studio/shell run package:dmg`: `EngineOS-Video-Creator-0.1.0-arm64.dmg`, 543487747 bytes, sha256 `5352ec8c2ab810242d47ff72680c65affa10233a819b55a616f768d5507e6a1c`; 31 nested signatures and 49331 payload files verified; `hdiutil verify` VALID.
- Portal under `next dev` shows version 0.1.0 with a live download link (HEAD 200, full length) from the local release server.
- Still not run: typecheck, lint, tests, security review, critic. The installed app was not opened; first-run setup is unverified. The pairing migration is not applied.

## Install test on the owner's Mac, 2026-11-23 (owner asked: "Yes, test install", "Back up, then install")

Backup taken first: `~/Library/Application Support/VideoStudio/db-backup-2026-11-23-before-installer`
(database folder and the previous watcher plist).

Three defects found by running the installed app, each fixed and re-run:

1. Setup step `migrations` failed with "database is locked": the watcher agent of the earlier
   script install held the database. `apps/shell/src/setup/steps/migrations.step.ts` now boots the
   agent out and runs `studio stop` before `migrate deploy`.
2. The setup window failed with `ERR_FILE_NOT_FOUND` on `file://…/app.asar/setup.html`: the
   `GrantFileProtocolExtraPrivileges` fuse is off (ADR 0005). The window now loads from a
   `studio-setup://` scheme serving a closed list of two files (`apps/shell/src/electron/setup-protocol.ts`).
3. `GET /install/presence` returned 500 `install-version-unavailable`: the api capped the version
   file at 64 KB, while the packaged `payload/manifest.json` is 6.9 MB (one hash per file).
   `apps/api/src/install/install-identity.ts` now bounds the read at 32 MiB.

Current package: `EngineOS-Video-Creator-0.1.0-arm64.dmg`, 544874403 bytes, sha256
`13562828e64261c34b919872fa90eb2c905b7a23646e2ece7d3191e4977da4d1`, `hdiutil verify` VALID. It
supersedes the checksum in the section above.

Observed on the installed app (`/Applications`, `codesign --verify --deep --strict` ok):

- Setup log ends `setup-complete`; `migrations` ran against the real database.
- Watcher launchd agent `com.videostudio.watcher` runs the app's bundled node and payload.
- `GET http://127.0.0.1:4311/health` 200 `{"status":"ok","database":"ok"}`; web on 4310 answers 307.
- `GET /install/presence` 200: product `engineos-video-creator`, contract 1, version `0.1.0`,
  platform `darwin-arm64`, `paired: false`.
- Installed `studio doctor`: all good, two warnings (search model absent, search index pending).
- Local portal (`next dev`, port 3100) lists version 0.1.0 with the new checksum from the local
  release server.

Not verified:

- Portal detection in a browser. This package carries no portal origin (the URL is decided at
  deploy time), so the api sends no `Access-Control-Allow-Origin` to any page; the local portal
  shows "Access to apps on this computer is blocked". Pairing and the status view are untested.
- The setup window on screen. Every interactive step was already done on this Mac, so the
  `studio-setup://` page was never shown with content.
- A clean first install (empty data home).

Open:

- `seed-catalog` warns `seed-partial` on every launch: four music entries in
  `seeds/catalog.seed.json` (`spesia-music-680`, `spesia-music-683`,
  `mixkit-trap-electro-vibes-126`, `mixkit-lullaby-night-531`) name source files under
  `video-pipeline-2026-11-17-spesia/music/`, which is in neither the repository nor the payload.
  30 entries seed; `seededVersion` stays null.
- The payload includes compiled test files (`api/dist/__tests__/…`).
- Build-unblocking edits outside this feature, made with the owner's approval for the lint part:
  `apps/web/src/messages/cart/pt-BR.ts` (return types), `apps/web/src/features/recipes/components/RecipeEditor.tsx`
  (unknown-rule disable comment removed), `apps/web/src/features/cart/cart-store.ts`
  (`sensitivity` typed from `AssetVersionView`; this one is a type change, beyond the lint approval).
- Still not run: typecheck, lint, tests, security review, critic. Nothing is committed.

## Local portal origin, 2026-11-23 (owner asked: "Yes, allow locally"; plan section 9.6)

- Local test package (NOT for publishing; it bakes `http://localhost:3100` as the portal origin):
  544952356 bytes, sha256 `090365eac1fa03d29adff6a84f8a24feab473391a14d29499d3fa4d8171e6a44`.
  It supersedes the checksum above in `apps/shell/out/dmg/release`. Built with
  `ENGINEOS_VIDEO_CREATOR_ALLOW_LOCAL_PORTAL=1 ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN=http://localhost:3100`.
- Installed and started; setup log ends `setup-complete`.
- `GET /install/presence` with `Origin: http://localhost:3100`: 200 and
  `Access-Control-Allow-Origin: http://localhost:3100`. With `http://localhost:3999` or
  `https://example.org`: no allow header.
- Preflight for `/install/status` and `/install/pair` from `http://localhost:3100`: 204 with the
  allow headers. Preflight from `http://localhost:3999`: 403. `/install/status` without a token: 401.
- A `fetch` run inside the portal page (built-in browser pane, origin `http://localhost:3100`)
  read presence: 200, version `0.1.0`, `paired: false`.

Not verified:

- The portal's own detection card. The built-in pane reports the loopback permission as `denied`
  to `navigator.permissions.query`, so the page shows "Access to apps on this computer is blocked"
  and sends no request; Chrome was not connected to the session. Needs one look in Chrome.
- Pairing from the app's menu and the status view.
- Not rebuilt since: a package without the local origin. The next publishable package must be
  built without the two variables above.

Owner confirmation, 2026-11-23: with the portal open in Chrome at `http://localhost:3100`, the
detection card shows the studio as installed ("Yes, it detects it"). Observed by the owner, not by
the agent. Pairing and the status view remain untested.

## Pairing test, 2026-11-23 (owner asked: "Yes, test pairing")

Run by the agent against the installed app, with `Origin: http://localhost:3100`; code and token
were never printed:

- `studio portal pair` (the menu's own command): exit 0, one 8-character code with an expiry.
- `POST /install/pair` with a wrong code: 401. With the issued code: 200 and a 43-character token.
  The same code a second time: 401 (single use).
- `GET /install/presence`: `paired: true` after pairing.
- `GET /install/status` with the token: 200, `api`, `web`, `watcher`, `database`, `ffmpeg`,
  `captureBrowser`, `dataHome` all `ok`, `searchModel: not-installed`, `setup: complete`.
- `studio portal disconnect`: `{"revoked":1}`; the token then gets 401 and presence returns
  `paired: false`. The test pairing was removed.

Not verified:

- The menu path. The owner reported clicking "Conectar ao portal" and seeing a new tab, but the
  app recorded no pairing: zero rows in `install_pair_codes` before the agent's run, no CLI run
  and no `POST /install/pair` in the logs. Which item was clicked is unknown.
- The portal page redeeming the `#pair=` link and showing the status view in Chrome.
- The tray has no icon: it is the text "Estúdio" / "Estudio" / "Studio" in the menu bar.
