# Installer upgrade guards — design

Date: 2026-11-24 · Domain: desktop shell (`apps/shell`), CLI (`tools/cli`) · Risk: high (the change
sits in front of a database migration on the owner's real data; it runs no migration itself)

## Problem

On 2026-11-24 an upgrade over a running install failed (evidence:
`.engineos/changes/2026-11-24-skills-page-redesign.md`, Verification, 07:39 to 08:05).

1. **The old API survived the upgrade.** The new app's setup step "Prepare the database" ran
   `studio stop` and then `prisma migrate deploy` while the old API (pid 41067) still held port 4311
   and `db/studio.sqlite`. The step answered `migrations-failed`; the database was left untouched.
2. **Services started with setup unfinished.** With setup stopped at that step, the app's
   `studio start` path still started the API and the web (07:57:51) against a database with a pending
   migration, and the watcher stayed unregistered.

## Root cause of gap 1

The record was judged `foreign` because of a space in the install path, not because the app was
moved to the Trash.

- `isLaunchedProcess` (`tools/cli/src/services/process-identity.ts`) splits the `ps` command line on
  whitespace and looks for the entry file as one token.
- The packaged entry file is
  `/Applications/EngineOS Video Creator.app/Contents/Resources/runtime/payload/api/dist/main.js`.
  Split on whitespace it becomes three tokens, so the check answers false for every packaged API.
- Seen on the live process on 2026-11-24, between 08:11 and 08:16: pid 14263 (the API, running with
  no pid record left) printed
  `/Applications/EngineOS Video Creator.app/…/node /Applications/EngineOS Video Creator.app/…/payload/api/dist/main.js`,
  and the current check on that exact line answers `false`.
- Consequence: in the packaged app `studio stop` has never stopped the API. `stopService` removes the
  pid record and throws `ServiceProcessMismatchError`; the setup step ignores the exit code of
  `studio stop`. The web is recognised only through its renamed title (`next-server (v…`) plus the
  port, which is why the web did stop. Development checkouts have no space in their path, so no test
  or development run ever met this.
- The move to the Trash changed nothing here: `ps` prints the arguments the process was started
  with, and the new app sits at the same path, so the recorded entry path equals the new one.
- A second, latent cause in the same function: `recordedProcess` also requires the recorded entry
  path to equal this copy's entry path. A service started by a copy installed somewhere else is
  `foreign` too, although setup's "start services" step expects `studio stop` to stop it.
- Not proven: the exact Prisma error of the 07:39 failure (the setup log holds ids only). The guard
  below removes the precondition either way.
- Reported by the session recovering the live app (not checked here; its notes are in
  `.engineos/changes/2026-11-24-skills-page-redesign.md`, Verification, 08:10 to 08:13): the bundled
  `prisma migrate status`, run on a scratch copy of the database, found 9 migrations with 1 not
  applied. The packaged migration tool itself works, which leaves the database still being in use
  as the likely reason the deploy failed.

## Decisions

### Gap 1 — `studio stop` recognises what it recorded (`tools/cli/src/services`)

- `isLaunchedProcess` matches the entry path as one whole argument of the command line (bounded by
  the start, the end or whitespace), so a path with spaces matches and a longer path that merely
  contains it does not.
- A recorded process is identified against the entry path and port **its own record** names. It is
  ours when the live pid still runs that recorded entry file; it is also *current* when that entry
  file is this copy's.
  - `stop` signals any recorded process that is ours, current or not (the documented rule: "only
    after `ps` shows that pid still runs the recorded entry file"). The check before `SIGKILL` uses
    the same recorded identity.
  - `start` answers "already running" only for a current one. For one started by another copy it
    keeps the record (so `stop` can still stop it) and lets the port check refuse.
  - `doctor` reports a recorded process of another copy as a foreign record, as before.
- A pid whose command line does not run the recorded entry file stays `foreign`: never signalled.

### Gap 1 — the migrations step refuses while the database is in use (`apps/shell/src/setup`)

After `bootoutAgent` and `studio stop`, and before `migrate deploy`, the step asks the machine:

1. Does any process of this user listen on the packaged API port?
   (`/usr/sbin/lsof -nP -iTCP:<port> -sTCP:LISTEN -t`)
2. Does any process of this user have `db/studio.sqlite` open? (`/usr/sbin/lsof -nP -t <file>`)

Both are read-only, fixed argv, no shell, through the injected process runner. They are polled for a
short bounded time (5 polls, 500 ms apart) to let a stopping process let go. If either still answers
yes, `migrate deploy` is **not run** and the step fails with a reason that says so:

- `api-still-running`: something still listens on the API port.
- `database-in-use`: another program still has the database open.

An answer that cannot be read (lsof could not start) counts as in use: with real data behind it, the
step fails closed. The two reasons get their own sentences in English, Portuguese and Spanish
(`apps/shell/src/i18n/setup-labels-*.ts`; the owner allowed these three files on 2026-11-24). The
sentences tell the owner what to do; they carry no path and no pid.

The step signals nothing itself. A leftover process with no pid record (as pid 14263 was on the
owner's Mac on 2026-11-24, after the old `stop` removed its record) is refused, named by the
sentence, and stopped by the owner.

### Gap 1 — quitting the app does not stop its services

Proposed and decided by the owner on 2026-11-24: **keep running** (ADR 0005, option C1, unchanged).
Upgrade safety must hold after a crash or a force-quit too, where no quit hook runs, so it comes from
the fixed `stop` and the guard above. No quit code changes.

### Gap 2 — Start runs setup first (`apps/shell/src/electron`, `apps/shell/src/setup`)

In packaged mode the menu's Start no longer spawns `studio start` unless the last setup run of this
launch completed.

- `startGate(lastProgress)` (pure, `apps/shell/src/setup/start-gate.ts`): `start` only when the last
  progress has phase `complete`; otherwise `setup-first` (setup not run yet, running, refused or
  failed).
- On `setup-first` the shell opens the setup window and runs setup (or joins the run in progress).
  Setup's own step 8 starts the services once every earlier step is done, so a completed setup still
  ends with the studio up and the watcher registered.
- Stop is never gated. Development mode is unchanged.
- The state is this launch's in-memory progress. Setup runs at every launch and every step asks the
  machine, so no "setup done" flag is persisted (`setup-record.ts` keeps that rule).

## Rejected alternatives

- **Setup kills whatever listens on 4311.** It would signal a process the CLI never recorded; the
  rule that only a recorded, re-verified pid is signalled stays.
- **Quit stops the API and the web.** Does not cover a crash or force-quit, changes ADR 0005 and
  stops services the owner started from the Terminal.
- **Refuse Start with a menu error instead of running setup.** The owner would have to find
  "Set up" themselves; running setup is the action that makes Start possible.
- **A persisted "setup complete" flag.** Goes stale across upgrades; the record deliberately never
  says "done".

## Error handling

- Guard blocked: step `failed` with `api-still-running` or `database-in-use`; setup stops; "Try
  again" reruns the sequence. Nothing is written to the database.
- `studio stop` failing inside the step is still not fatal by itself: the guard decides.
- Start while setup is incomplete: no child process is spawned; the setup window opens; one
  `start-deferred` line goes to the setup log (ids only).

## Testing (authored, run only on the owner's approval)

- `tools/cli/src/services/process-identity.test.ts`: entry path with spaces, plain path, a longer
  path that contains it, the renamed-title rule.
- `tools/cli/src/services/service-manager.test.ts`: `stop` on a real child started from a folder
  with a space, recorded by another copy's entry path; a foreign pid is not signalled. Needs
  `/bin/ps`, so it is skipped where `ps` is not permitted (the command sandbox).
- `apps/shell/src/setup/database-holders.test.ts`: lsof answers mapped to free, held, unknown.
- `apps/shell/src/setup/steps/migrations.step.test.ts`: port held, database held, released within
  the wait, clear; `migrate deploy` is requested only when clear.
- `apps/shell/src/setup/start-gate.test.ts`: every setup phase.

## Non-goals

- No migration is run, no build, no packaging, no write under the data home.
- `apps/web` is untouched.
- Not fixed here, reported as a follow-up: setup's "start services" step calls services current when
  the app version and install path are unchanged. Two builds of version 0.1.0 at the same path are
  indistinguishable to it, so a rebuild with no pending migration keeps the old services serving.
