---
name: 2026-11-24-skills-page-redesign
status: active
owner: Claude (supervisor) for the owner
spec: n/a — fast change chosen by the owner; look of one page, no new behaviour
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
The `/skills` page has a cinema look: a film-strip banner on top with a drawn film reel, film strip
and waveform, and one poster card per skill with a coloured cover and a media icon picked from the
skill itself.

## Why
The owner sent a screenshot and asked: "the skill page is too ugly, improve the design, it is a video
maker page, so use video, cinema, audio icons and images to make this incredible".

## Scope
`apps/web/src/features/skills` (list card, artwork, banner, styles), `apps/web/src/app/(studio)/skills/page.tsx`
and the three `apps/web/src/messages/skills` files. The category tabs, the skill forms and the
catalog pages are unchanged.

## Checklist
- [x] Owner chose "Drawn in code (Recommended)" and "Fast change (supervisor) (Recommended)"
- [x] Media icon set and the rule that picks an icon and a colour tone per skill
- [x] Cinema banner replacing the page header (still the page's single `<h1>`)
- [x] Poster card replacing the shared `Card` on this list
- [x] Banner texts in pt-BR, en and es
- [x] Seen in the app on the dev server (127.0.0.1:4320), dark and light theme
- [x] Seen in the installed desktop app (127.0.0.1:4310), light theme

## What was made
- `skillArtworkOf(skill)`: picks one of 14 media icons (camera, waveform, scissors, motion, chart,
  upload, check, megaphone, script, film, clapperboard, palette, magnifier, reel) from keywords in
  the skill's id, name and non-category tags, falling back to the category, and one of five colour
  tones (two neighbouring stops of the brand gradient).
- `SkillGlyph`: the 14 icons as 24x24 stroke drawings, decorative (`aria-hidden`).
- `SkillsHero`: banner with film perforations top and bottom, eyebrow "Estúdio de vídeo", title,
  description, two facts ("14 skills", "2 categorias"), the two existing action links unchanged, and
  a drawn reel (turning slowly), film strip and waveform (pulsing). Motion stops under
  `prefers-reduced-motion`; the drawing hides below 768px.
- Poster card: cover band with the tone gradient, perforations, a round glass lens with the icon and
  a large faint copy of the icon; below it the name (stretched link to the catalog page), category,
  status, version, briefing clamped to five lines, then `Editar` and the cart button with their
  existing styling. No text sits on the cover.
- Icons seen for the owner's 14 skills: analytics-loop chart, demo-capture camera, fact-check and
  quality-gate shield-check, hook megaphone, producer and scene-generator clapperboard,
  publish-review upload, script page, seo-package and trend-research magnifier, tiktok-render film,
  voiceover waveform, "Teste corte de pausas" scissors.

## Not done
- Not seen at a phone width: the Chrome window did not shrink (it stayed 1920 wide) and the app
  refuses to load inside a frame, so the one-column layout and the hidden drawing are untested.
- Typecheck and lint did not run (owner's choice, see Human decisions).
- The installer bug found while installing (outside this change) is not fixed: the installed app
  cannot stop its own API because its path has spaces, so the next upgrade with a pending migration
  will fail the same way. It is handed to the session "Fix upgrade over a running desktop install".
- The setup's optional "Load the catalog" step did not record done (`seededVersion: null`); not looked into.
- The build also carries the other session's guided creation and link reference analysis work,
  which was never reviewed, and there is no `yt-dlp` on the machine.

## User checklist
- [ ] Run the web typecheck and lint when you want them (deferred together with the cart and guided-creation checks)
- [x] Rebuild and repackage the desktop app (done by the supervisor on 2026-11-24)
- [x] Install the new disk image: quit the app, open `apps/shell/out/dmg/release/EngineOS-Video-Creator-0.1.0-arm64.dmg` and replace the app in Applications (done by the owner at 07:38)
- [x] Sign in at 127.0.0.1:4310 (done by the owner at 08:04)
- [x] Finish the new app's setup (done 08:16 on the owner's approval: migration applied, watcher registered)
- [ ] Sign in again at 127.0.0.1:4310 (the service restart ended the session)
- [ ] Decide what to do with the two backup copies in the data home's `db` folder once the app has run well for a while (`studio.sqlite.pre-asset-job-2026-11-24` is this session's)
- [ ] Look at the page once on a narrow window or phone

## Verification
[validation] pending — final-stage user approval required (web typecheck and lint)
Visual check done on 2026-11-24 in Chrome at 127.0.0.1:4320 (dev server), 1920x928:
- Banner and 14 cards rendered, one `<h1>`, no horizontal scroll, no name cut, all cards 400x391.
- Clicking a card's text opened `/catalogo/fagmer-video-analytics-loop`; `Editar` opened
  `/skills/fagmer-video-analytics-loop/editar`.
- The cart button on a card was on top of the stretched link; adding fagmer-video-voiceover took the
  cart from 5 to 6 and removing it took it back to 5 (the owner's five items untouched).
- Light theme seen by switching the page's theme attribute for one screenshot, then set back to dark;
  the saved theme was not changed.
- Console: no errors or warnings after reloads.

Build for the desktop app, 2026-11-24, from the `video-studio` root with the 4320 dev server stopped:
- ran: `pnpm exec turbo run build` exit 0 (2026-11-24). "Tasks: 12 successful, 12 total", 31.3s; `/skills`,
  `/skills/[assetId]/editar`, `/skills/novo` and `/criar` are in the route list. The web step printed
  "Linting and checking validity of types" and passed, so the build's own lint and type check ran over
  the web app; the separate `eslint .` and `tsc --noEmit` scripts still did not run.
- ran: `pnpm --filter @studio/shell run package:dmg` exit 1 (2026-11-24), inside the command sandbox: the app
  was packaged and verified, then `hdiutil: create failed - Device not configured` (the sandbox blocks
  disk-image devices).
- ran: `pnpm --filter @studio/shell run package:dmg` exit 0 (2026-11-24), outside the sandbox: 31 nested
  signatures verified, payload manifest verified, disk image checksum VALID. Result:
  `apps/shell/out/dmg/release/EngineOS-Video-Creator-0.1.0-arm64.dmg`, 545848127 bytes, sha-256
  `e2ff70049372669ec2f26641814498c80eb1f1a99e5c98f059ac1daf7a00574d`. The packaged web build id
  (`xwzLlIi3oBuEasLFbEaJk`) equals the build above and its CSS holds the Skills card styles.
- Not run: the packaged app itself. It is not installed, so the new Skills page was not seen at 127.0.0.1:4310.
- Checked 2026-11-24 07:34 after the owner answered "Installed, check it": the install had not taken
  effect. `/Applications/EngineOS Video Creator.app` is still dated Nov 23 23:50 with build id
  `1O2Th3ikyo1ziUei6KQKV` (the new one is `xwzLlIi3oBuEasLFbEaJk`), the new disk image is not mounted,
  and 127.0.0.1:4310/skills still renders the old page (plain header, no card covers).
- Checked again 2026-11-24 07:36 after "Replaced, check again": the disk image is now mounted at
  `/Volumes/EngineOS Video Creator` and holds the new build, but the copy in `/Applications` is
  unchanged (same date and build id) and 4310 still serves the old page from the still-running old app.
- 2026-11-24 07:38: the owner quit the old app, moved it to the Trash and copied the new one into
  `/Applications` (build id `xwzLlIi3oBuEasLFbEaJk`, 50478 files, same count as the disk image).
- 2026-11-24 07:39: the new app's first-run setup stopped at "Prepare the database" ("The database
  could not be prepared"). Read-only findings: the setup found the guided-creation migration
  `20261123180000_asset_job_cost_source` pending and ran `prisma migrate deploy`; the database is
  untouched (`_prisma_migrations` ends at `install_pairing`, no failed row, `cost_entries` has 38 rows
  and the old CHECK). An API kept serving requests into the same data folder after the old app quit
  and 4320 was up, so the likely cause is the database being held open (not proven: the setup log
  holds ids only). The new Skills page is still not seen in the installed app.
- 2026-11-24 07:44: the other session answered that the API on 4311 is not its own and stopped its
  4320 dev server. Checked: `http://127.0.0.1:4311/watcher` still answers, so an API outside the app
  is alive and survived the setup's own `cli stop`; the watcher agent is unloaded
  (`launchctl print` finds no `com.videostudio.watcher`). The owner's backup file
  `studio.sqlite.pre-asset-job-2026-11-24` did not exist yet at 07:43.
- 2026-11-24 07:46, on the owner's "Yes, run both (Recommended)":
  - ran: `sqlite3 "<data home>/db/studio.sqlite" ".backup '<data home>/db/studio.sqlite.pre-asset-job-2026-11-24'"` exit 0 (2026-11-24).
    The copy (450560 bytes) passes `pragma integrity_check` and matches the live database: 38
    `cost_entries` rows, same id and usd sums, 82 schema objects, last migration `install_pairing`.
  - The listener on 4311 was pid 41067, the old app's own API (`runtime/payload/api/dist/main.js`,
    started Nov 23 23:51, parent launchd, running from the copy in the Trash). It outlived the old
    app's quit and the new setup's `cli stop`.
  - ran: `kill -TERM 41067` exit 0 (2026-11-24). After it: nothing listens on 4310 or 4311 and no
    process has `studio.sqlite` open; only the new app's setup window is running.
- 2026-11-24 07:51 to 08:03, read-only checks after the owner answered "Still "Setup stopped"", then
  "Asks for passphrase", then pasted "Não foi possível falar com o serviço local. Verifique com
  `studio doctor`.":
  - The new app's API (pid 14263) and web (pid 14282) started at 07:57:51 from the copy in
    `/Applications` (pid files written by the app's own `studio start`), without the setup having
    finished. `127.0.0.1:4310/skills` redirects to the sign-in page, which loads with no error.
  - The migration is still not applied: `_prisma_migrations` ends at `install_pairing` (8 of the 9
    packaged migrations) and the `cost_entries` CHECK is still `('run', 'curation')`.
    `setup-state.json` is unchanged and the watcher agent is not registered (heartbeat stale since 07:39).
  - `cost_entries` has 39 rows: the API indexed one more run cost at start-up, so the live database
    is one row ahead of the 07:46 backup. The migration copies every row and deletes none.
  - Static check of the migration against the live table: same 20 columns, no view, trigger or
    foreign key refers to `cost_entries`. Nothing in its text explains the first failure.
  - Why the old API survived `cli stop`: `stopService` signals a recorded pid only when the process
    still matches the recorded entry file, and treats it as foreign otherwise; the old app had been
    moved to the Trash under it. The pid files now point at the copy in `/Applications`.
  - The pasted error is the web's text for an API that does not answer or answers 5xx
    (`describeApiError`). No API listened on 4311 from 07:46 to 07:57, which fits; which page showed
    it is not confirmed. Separately, the installed API refuses state-changing requests whose origin
    is not `http://127.0.0.1:4310` (`origin-not-allowed` in `api.log` at 07:57:59 and 07:58:37), so
    signing in from the 4320 dev page against the installed API cannot work.
- 2026-11-24 08:04, the owner answered "All steps done" to what the setup window shows. On disk
  nothing changed: same API pid, database files last written at 07:57, migration still not applied,
  `setup-state.json` unchanged, watcher heartbeat still 07:39:12. The owner signed in at
  127.0.0.1:4310 themselves (`auth.login-accepted` at 08:04:43).
- 2026-11-24 08:05, new Skills page seen in the installed app, Chrome at 127.0.0.1:4310/skills,
  1920x833, light theme (build `xwzLlIi3oBuEasLFbEaJk`):
  - Banner with its four drawings, one `<h1>` ("Skills"), 14 cards with 14 covers and 14 lenses, all
    cards 400x391, no horizontal scroll, the same 14 names as on the dev server.
  - Clicking a card's text opened `/catalogo/fagmer-video-analytics-loop`; `Editar` was on top of
    the stretched link and opened `/skills/fagmer-video-analytics-loop/editar`.
  - The cart button on the fagmer-video-voiceover card was on top of the stretched link; adding took
    the cart from 6 to 7 and removing took it back to 6 (the owner's six items untouched).
  - Console: no messages after a reload.
  - The page header shows "Watcher parado, último sinal às 07:39:12": the app's setup is unfinished.
- 2026-11-24 08:10, the owner answered "Ran both, check" (quit and reopen the app). Checked: the app
  was not restarted (main process 6412 still dates from 07:39:03, API 14263 from 07:57:51), the
  Terminal panel's only tab shows neither command, and nothing changed on disk (migration not
  applied, `setup-state.json` unchanged, watcher agent not registered, heartbeat 07:39:12).
- 2026-11-24 08:10 to 08:13, on the owner's "Yes, run them (Recommended)", typed into the owner's
  Terminal panel (tab "restart app"):
  - ran: `osascript -e 'quit app "EngineOS Video Creator"'` exit 0 (2026-11-24). The app quit; its
    API (14263) and web (14282) kept running.
  - ran: `open "/Applications/EngineOS Video Creator.app"` exit 0 (2026-11-24). New main process
    20442 at 08:11:10; its setup ran and the database step failed again: the migration is not
    applied, both pid files are gone, the web is stopped, and the API (14263) still listens on 4311
    with `studio.sqlite` open.
  - Cause, read from the code and the process table: `isLaunchedProcess` in
    `tools/cli/src/services/process-identity.ts` tests `commandLine.split(/\s+/).includes(entryPath)`,
    and the installed path `/Applications/EngineOS Video Creator.app/...` contains spaces, so the API
    is never recognised. `stopService` then removes the pid file and throws
    `ServiceProcessMismatchError` without signalling. The web is stopped only through its
    `next-server (v` title fallback. This replaces the 08:03 guess that the Trash move was the reason.
  - ran: bundled `prisma migrate status` against a scratch copy of the database exit 1 (2026-11-24):
    "9 migrations found", one not applied (`20261123180000_asset_job_cost_source`). The bundled tool
    works; `migrate deploy` was not run anywhere by the supervisor.
- 2026-11-24 08:15 to 08:17, on the owner's "Yes, stop and reopen (Recommended)":
  - ran: `kill -TERM 14263` exit 0 (2026-11-24), after confirming the pid was still the installed
    API. After it: nothing listened on 4310 or 4311 and no process held `studio.sqlite`.
  - ran: `osascript -e 'quit app "EngineOS Video Creator"' && /bin/sleep 3 && open "/Applications/EngineOS Video Creator.app"` exit 0 (2026-11-24), in the owner's Terminal panel.
  - Result, read-only: the app's own setup applied `20261123180000_asset_job_cost_source`
    (`_prisma_migrations` row finished, not rolled back, 9 of 9). `cost_entries` now has the
    `('run', 'curation', 'asset-job')` CHECK, the same 39 rows (sum of ids 780, max id 39), both
    indexes, 82 schema objects, `pragma integrity_check` ok.
  - The watcher agent `com.videostudio.watcher` is registered and running (pid 22498, heartbeat
    08:16:38); API (pid 22505, 4311) and web (pid 22510, 4310) started at 08:16:09.
  - `setup-state.json` still has `seededVersion: null`: the optional "Load the catalog" step did
    not record done (it only warns; setup goes on). Not looked into.
  - The API restart ended the owner's web session: 127.0.0.1:4310/skills redirects to the sign-in
    page again, with no error. The Skills page was not seen again after the restart; the build is
    the one checked at 08:05.
- 2026-11-24 08:29, the owner pasted "Não foi possível falar com o serviço local. Verifique com
  `studio doctor`." again. Read-only findings:
  - Everything is up: API `/health` 200 on 4311, web 200 on 4310, watcher running with a fresh
    heartbeat, no 5xx in `api.log`.
  - `api.log` has `origin-not-allowed` refusals at 08:16:50, 08:18:06, 08:24:14, 08:24:31, 08:25:18
    and 08:28:29 and no `auth.login-accepted` since 08:04. Only a web server whose own origin is
    not `http://127.0.0.1:4310` can cause them, because the web's proxy replaces `Origin` with its
    own (`upstreamHeaders` in `apps/web/src/lib/bff/proxy.ts`): that is the 4320 dev server.
  - Reproduced with a body that holds no passphrase (`POST /api/studio/auth/login`, body `{}`):
    through 127.0.0.1:4320 the answer is 403 `origin-not-allowed` (same correlation id in
    `api.log`); through 127.0.0.1:4310 it is 400 `invalid-request`, so it reaches the API.
  - `loginErrorText` in `apps/web/src/features/auth/LoginForm.tsx` shows the "could not talk to
    the local service" text for any 403, which is why a refused origin reads as a dead service.
  - So: signing in on the 4320 dev page cannot work while the API on 4311 is the installed app's.
    Signing in at 127.0.0.1:4310 works. Not fixed here; outside this change.

## Human decisions
- 2026-11-24 | owner | none fired | approved | imagery: "Drawn in code (Recommended)"
- 2026-11-24 | owner | none fired | approved | planning: "Fast change (supervisor) (Recommended)"
- 2026-11-24 | owner | none fired | deferred | final checks (`tsc --noEmit` and `eslint .` in apps/web): "Skip for now (Recommended)". Nothing ran
- 2026-11-24 | owner | none fired | declined | extra artifact: "Proceed without artifact (Recommended)"
- 2026-11-24 | owner | none fired | deferred | rebuild and repackage the desktop app (`pnpm exec turbo run build`, then `pnpm --filter @studio/shell run package:dmg`): "Wait for other work (Recommended)". Nothing ran
- 2026-11-24 | owner | none fired | approved | rebuild and repackage, reopened by the owner: "You run it (Recommended)" (the supervisor runs both commands once the 4320 dev server is stopped)
- 2026-11-24 | owner | none fired | approved | how to get the 4320 dev server stopped: "Ask the other session (Recommended)". The session that owns it stopped it
- 2026-11-24 | owner | destructive-action | approved | new app's setup failed at "Prepare the database"; asked how to get a working app back, with the migration named (`20261123180000_asset_job_cost_source`, rebuilds `cost_entries`, 38 rows copied) and the database named (`~/Library/Application Support/VideoStudio/db/studio.sqlite`): "Back up, then retry (Recommended)". The owner makes the backup and clicks "Try again"; the app's own setup runs the migration, not the supervisor. Way back: the backup copy and the old app in the Trash
- 2026-11-24 | owner | destructive-action | approved | the database step failed again because the installed API (process 14263) kept the database open; asked whether to send `kill -TERM 14263` and then quit and reopen the app from the Terminal panel so its setup applies the pending migration to `~/Library/Application Support/VideoStudio/db/studio.sqlite`, way back the 07:46 backup copy: "Yes, stop and reopen (Recommended)". The app's setup ran the migration, not the supervisor
- 2026-11-24 | owner | none fired | approved | the app had not been restarted; asked whether the supervisor should type the quit and open commands for "EngineOS Video Creator" into the owner's Terminal panel, naming that the app's setup then applies the pending migration to `db/studio.sqlite` and registers the watcher: "Yes, run them (Recommended)"
- 2026-11-24 | owner | none fired | approved | the owner had not run the backup or stopped the API; asked whether the supervisor should run both, with both commands named (sqlite3 `.backup` outside the sandbox; a normal stop signal to the listener on 4311): "Yes, run both (Recommended)"

## Changes registered
Not a git repository. Files:
- `apps/web/src/features/skills/skill-artwork.ts` (new)
- `apps/web/src/features/skills/components/SkillGlyph.tsx` (new)
- `apps/web/src/features/skills/components/SkillsHero.tsx` (new)
- `apps/web/src/features/skills/skills-hero.module.css` (new)
- `apps/web/src/features/skills/components/SkillList.tsx` (shared `Card` replaced by the poster card)
- `apps/web/src/features/skills/skills.module.css` (card, cover, lens, ghost and tone styles; `.actions`, `.modes`, `.bodyInput` kept)
- `apps/web/src/app/(studio)/skills/page.tsx` (`PageHeader` replaced by `SkillsHero`)
- `apps/web/src/messages/skills/{pt-BR,en,es}.ts` (`heroEyebrow`, `categoryCount`)
