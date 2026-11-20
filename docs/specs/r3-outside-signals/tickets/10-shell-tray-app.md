# 10-shell-tray-app: Menu-bar tray main process (R3-08 part 2)

**What to build:** The Electron main process of the menu-bar shell in `apps/shell/src/**`: a tray icon and a menu that show the state of the watcher, api and web, the next scheduled slot and the number of runs at `review`, with "Iniciar", "Parar" and "Abrir estúdio". Start and stop invoke the `studio` binary; the shell signals no process and writes nothing in the data home.

**Blocked by:** 09-shell-dependencies

**Status:** ready-for-agent

## Requirements
- R3-AC-25.3 to R3-AC-25.8 (criteria written in `R3-08-graph.md`; SPEC 0006 section 9 R3-08; ADR 0005 decisions 1 to 3; vetting 0002 section 8)

## Technical details
Read: SPEC 0006 section 9 R3-08 and section 4.6; ADR 0005; `docs/vetting/0002-shell-runtime.md` section 8 **and section 12** (ticket 09's corrections to API, option and fuse names win over section 8 where they differ); `tools/cli/src/services/service-spec.ts`, `service-pid-file.ts` and `tools/cli/src/commands/services.command.ts` (read only, never imported, never edited); `packages/shared/src/run-format/watcher-heartbeat.ts`, `packages/shared/src/run-files/watcher-heartbeat.ts`, `packages/shared/src/schedules/slots.ts` and `packages/shared/src/schedules/files/`.

### Structure
- `src/main.ts` and `src/electron/**` are the only files that import `electron`. Everything else is pure TypeScript over Node built-ins and `@studio/shared`, and is what the tests cover.
- Suggested folders (the worker may rename, keeping one concept per file and files under about 300 lines): `src/config/` (shell configuration), `src/state/` (readers and the state model), `src/menu/` (menu model and pt-BR labels), `src/actions/` (studio invocation, open-studio URL), `src/electron/` (tray, menu rendering, security settings).
- No runtime npm dependency: imports are `electron`, `node:*` and `@studio/shared/*` (inlined by the `build` script of ticket 09). Importing `@studio/core`, `@studio/cli`, Nest, Prisma or any other package is not allowed.

### Shell configuration (contract frozen for ticket 11)
The packaged app reads one bundled JSON file, `shell-config.json`, placed beside `main.js` inside `app.asar` by ticket 11, so the asar integrity fuse covers it. This ticket owns its schema and reader:

| Field | Type | Rule |
|---|---|---|
| `format` | `1` | literal |
| `nodeBinary` | string | absolute path of the Node binary the installer used (the same value the watcher plist gets) |
| `cliMain` | string | absolute path of `tools/cli/dist/main.js` |
| `dataHome` | string | absolute, normalized data home root |
| `webPort` | integer | 1024 to 65535 |
| `apiPort` | integer | 1024 to 65535, different from `webPort` |

Strict: an unknown key, a relative path, a path with `..` or a line break, or a missing file is a typed configuration error. On that error the shell shows a tray menu with one disabled line saying the installation is incomplete and "Sair", and performs no action. The shell never takes these values from an environment variable, an argument or a data-home file. Why a baked file: a login-item app starts with a minimal `PATH`, so `studio` and `node` cannot be found by name, and fuse `RunAsNode` is off, so the app cannot be its own Node.

### State model (pure)
Inputs are read on a timer and passed to one pure function with an injected clock.

| Subject | Source | States |
|---|---|---|
| Watcher | `<dataHome>/logs/watcher.heartbeat.json` through `readWatcherHeartbeat` and `WATCHER_HEARTBEAT_STALE_AFTER_MS` of `@studio/shared` | `alive` (fresh), `dead` (stale, dated in the future beyond the limit, unreadable or invalid), `absent` |
| api, web | `<dataHome>/logs/api.pid.json`, `web.pid.json` (the records of `service-spec.ts:33-35`) | `running` (valid record whose pid is alive), `stopped` (no record, or a record whose pid is not alive), `unknown` (record present but invalid) |
| Next schedule | `<dataHome>/schedules/*/schedule.json` through `listScheduleIds`, `readScheduleFile` and `nextSlots` | the earliest next slot over schedules whose status is `active`, or none; an unreadable schedule is skipped and counted |
| Runs at `review` | `<dataHome>/runs/*/run.json` | a count |

Rules:
- The pid record reader is the shell's own (the CLI's schema lives in `tools/cli/src/services/`, which this release does not move): strict object with `service`, `pid`, `startedAt`, `entryPath`, `port`, at most 4096 bytes, exactly the fields of `ServicePidRecordSchema`. A test fixture holds one record written in that shape so drift is visible in review.
- Liveness uses `isProcessAlive` of `@studio/shared/run-files` (signal 0). That is the only process call besides the `studio` invocation. The shell never sends `SIGTERM`, `SIGKILL` or any other signal, and never removes or rewrites a pid record, including a stale one: `studio start` and `studio stop` already do that.
- The shell is read-only in the data home. It opens no file there for writing and creates no log file there (ADR 0005, consequences).
- Runs at `review`: use a reader exported by `@studio/shared/run-files` if one lists or parses run files. **Decision for the worker to make and record:** which helper is used, or, if none fits, a bounded directory read with `node:fs` that parses each `run.json` with the shared run schema. Default bounds: at most 2,000 run folders per scan, files over the shared size limit skipped, an unreadable run skipped and counted.
- Polling. **Decision for the worker to make and record**, with these defaults: heartbeat and pid records every 5 s; schedules and runs every 60 s and once when the menu is opened. No file watcher on the data home.

### Menu
Labels fixed by the spec, used verbatim: **"Iniciar"**, **"Parar"**, **"Abrir estúdio"**. Every other owner-facing text is pt-BR (D16) and chosen by the worker. Defaults: "Watcher: ativo" / "Watcher: parado", "Api: rodando" / "Api: parada", "Web: rodando" / "Web: parado", "Próxima execução agendada: qua., 25/11 09:00" / "Sem agendamentos ativos", "Em revisão: N", "Abrir ao iniciar sessão" (checkbox, default off), "Sair". The next slot is formatted in the Mac's local zone with `Intl.DateTimeFormat('pt-BR', ...)`.

Enabled rules, from the pure menu model:
- "Iniciar" is enabled when api or web is not `running` and no action is in flight.
- "Parar" is enabled when api or web is `running` or `unknown` and no action is in flight.
- "Abrir estúdio" is enabled only when web is `running`.
- While an action runs, both "Iniciar" and "Parar" are disabled and one line reads "Iniciando..." or "Parando...".
- The watcher has no control: no item starts, stops or restarts it (ADR 0005 decision 3).

Tray icon. **Decision for the worker to make and record.** Default: a text-title tray (no binary image committed), since no icon asset exists in the repository. If an image is used it lives in `apps/shell/src/assets/` and is a macOS template image.

### Actions
- Start and stop spawn the Node binary of the configuration with an explicit argument array and no shell: `spawn(nodeBinary, [cliMain, 'start'], { shell: false, ... })` and `[cliMain, 'stop']`. No argument is built from file content, menu text or user input.
- Child environment is an explicit allowlist, never `process.env` wholesale: `PATH` (fixed fallback `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`), `HOME`, `TMPDIR`, `LANG` when set, `VIDEO_STUDIO_HOME` = `dataHome`, `VIDEO_STUDIO_WEB_PORT` = `webPort`, `VIDEO_STUDIO_API_PORT` = `apiPort`. No provider key and no `NODE_OPTIONS`.
- **Known difference, to record in the return envelope for ticket 12:** `studio start` forwards the provider mock/live variables of its caller to the api (`tools/cli/src/settings/cli-settings.ts`); a shell-started api receives none and so runs with the api's defaults. Default: pass none. Do not invent a way to carry them.
- Outcome mapping uses the CLI exit codes of `tools/cli/src/errors/exit-codes.ts` (read only): `0` success; `5` a dependency is unavailable (not built, port in use, started but not ready); any other code a failure. The menu shows a short pt-BR reason line; the CLI's stdout and stderr are not shown and not logged (they may contain paths and URLs, K7). One action at a time; a child that has not exited after 60 s is reported as "sem resposta" and is **not** killed.
- "Abrir estúdio" calls `shell.openExternal` with exactly `http://127.0.0.1:<webPort>/`, built by one pure function from the configuration. It is the only `openExternal` call site in the package.
- Login item: the "Abrir ao iniciar sessão" checkbox calls the login-item API confirmed by vetting section 12. The process also accepts one switch, `--unregister-login-item`: it sets open-at-login to false and quits without creating a tray. Ticket 11's uninstaller uses it. Argument parsing is a pure function that accepts that one switch and ignores everything else.

### Security settings (vetting section 8, binding)
Applied in `src/electron/` before or at `ready`, with the names confirmed in vetting section 12:
- No `BrowserWindow`, no `WebContentsView`, no `BrowserView`, no `webContents.loadURL` or `loadFile` anywhere.
- `app.enableSandbox()` before `ready`.
- `app.on('web-contents-created')`: `setWindowOpenHandler` denies, `will-navigate` is cancelled.
- `session.defaultSession.setPermissionRequestHandler` denies every request.
- `autoUpdater` and `crashReporter` are never imported. No `net`, `http`, `https`, `dgram`, WebSocket or `fetch` use; no listener of any kind.
- `app.requestSingleInstanceLock()`: a second instance quits at once.
- No `--remote-debugging-port` or other switch is appended.
- No analytics or telemetry dependency.
- On macOS the app hides its Dock icon (tray-only). **Decision for the worker to record:** done in code or left to the `LSUIElement` plist key that ticket 11 sets; default: both.

### Logging (K7)
The shell writes no log file. Diagnostics go to `stderr` as one JSON line each with an event id, counts, reason ids and exit codes only: never a path, a URL, a file name, a schedule title or brief text.

## Acceptance criteria
- [ ] State model test: for each combination of heartbeat (fresh, stale, future-dated, absent, invalid JSON, oversized) and pid record (valid and alive, valid and dead, absent, invalid, oversized), the model returns the state in the table above.
- [ ] Schedule test, on an `fs.mkdtemp` data home with fixture `schedule.json` files: the next slot equals the earliest `nextSlots` result over `active` schedules; `paused` and `deleted` schedules are ignored; an unreadable schedule is skipped and counted; no active schedule yields "none".
- [ ] Review-count test: runs at `review` are counted, every other status is not, an unreadable `run.json` is skipped and counted.
- [ ] Menu model test: the menu contains items labelled exactly "Iniciar", "Parar" and "Abrir estúdio", a next-schedule line and a review-count line; the enabled rules above hold for every service-state combination and while an action is in flight.
- [ ] Invocation test with a fake spawner: start calls it once with `nodeBinary`, `[cliMain, 'start']`, `shell: false` and exactly the allowlisted environment keys; stop with `[cliMain, 'stop']`; exit codes 0, 5 and 1 map to the three outcomes; a second action requested while one is in flight is refused.
- [ ] URL test: the open-studio function returns `http://127.0.0.1:<webPort>/` for the configured port and nothing else; `grep -rn "openExternal" apps/shell/src` shows one call site.
- [ ] Configuration test: a valid file parses; an unknown key, a relative path, a `..` segment, equal ports or a missing file each yield the typed error.
- [ ] Argument test: `--unregister-login-item` is recognised; any other argument is ignored.
- [ ] `grep -rnE "BrowserWindow|WebContentsView|BrowserView|autoUpdater|crashReporter|loadURL|loadFile|remote-debugging" apps/shell/src` returns nothing outside comments.
- [ ] `grep -rnE "process\.kill\(|SIGTERM|SIGKILL|createServer|fetch\(|node:https?|node:net|node:dgram|WebSocket" apps/shell/src` returns nothing; no `writeFile`, `appendFile`, `rename`, `rm` or `unlink` targets a path under the data home.
- [ ] `grep -rn "from 'electron'" apps/shell/src` matches only `src/main.ts` and files under `src/electron/`; no `*.test.ts` imports them.
- [ ] `tools/cli/src/services/**` and `apps/watcher/launchd/**` are unchanged (diff evidence).
- [ ] The return envelope lists every decision marked "for the worker to make and record" with the choice taken.

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They touch no SQLite database, no real data home and no network: pure functions, in-memory fakes (clock, spawner, liveness probe), and `fs.mkdtemp` folders under the OS temp directory for file-based code. No test imports `electron` or starts Electron: the framework binary is not installed in this repository (build-only download, owner decision). Never weaken, skip or `.only` a test.

Per-ticket checks to list in the check plan (existing scripts only, none downloads anything): `turbo run typecheck --filter=@studio/shell`, `turbo run lint --filter=@studio/shell`, `turbo run test --filter=@studio/shell`, `turbo run build --filter=@studio/shell` (esbuild bundle of `dist/main.js`). `pnpm --filter @studio/shell run package` is not a check of this ticket.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md`, ADR 0003, `apps/shell/package.json`, the tsconfig or ESLint files of ticket 09, `tools/cli/**` or `packages/shared/**`.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).
- [ ] Identifiers, comments and log messages in English; owner-facing menu text in pt-BR with the three spec labels verbatim.
- [ ] No install, no framework download, no git write.

## EngineOS brief metadata
- Exclusive paths: `apps/shell/src`
- dependsOn: 09-shell-dependencies
- Owner: backend-coordinator
- Risk: high (new long-lived local process that starts and stops services); `security-reviewer` at the final gate
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/vetting/0002-shell-runtime.md` sections 8 and 12, `docs/adr/0005-packaged-shell.md`, `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, the package contract of `09-shell-dependencies`, `docs/specs/r3-outside-signals/tickets/R3-08-graph.md`
