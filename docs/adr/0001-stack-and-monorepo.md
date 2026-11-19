# 0001. Use a Turborepo + pnpm monorepo with Next.js, NestJS CQRS and Prisma SQLite

Date: 2026-11-18
Status: accepted (owner, 2026-11-18)

Decider: Ricardo Fagmer. Source: PRD 0001 (`docs/prds/0001-video-studio.md`), decisions D1, D4, D6,
D8, D9, D13, D15, D16. Statements marked **Assumption** are not in the PRD.

## Context

Video Studio is a single-user system installed on one Mac: a local web, an api, a background
watcher that executes runs, and a CLI (PRD D1, D4). It follows the eng-grafo reference architecture
(Turborepo + npm workspaces, Next.js, NestJS + `@nestjs/cqrs`, Prisma + SQLite, zod contracts in
`packages/shared`, JWT in an httpOnly cookie). It must absorb `ai-creator-engine`, a pnpm workspace
(`pnpm@10.12.1`, Node >= 22, `packages/*` only) holding `@ace/contracts`, `@ace/video` and
`@ace/toolbox`, which has no server and no database. The Spesia run also depended on two Python
tools (`video_tool.py`, `captions.py`) that live in no repository.

## Options considered

1. **Turborepo over pnpm workspaces, eng-grafo layout** (chosen, D6).
   - Pros: `ai-creator-engine` packages already use pnpm and `workspace:*`, so they copy in without
     changing their manifests; Turborepo gives task ordering and caching across 4 apps and 6
     packages; the layout matches eng-grafo, so its api and web conventions carry over.
   - Cons: departs from eng-grafo's npm, so its root scripts and install steps must be rewritten
     for pnpm; pnpm's strict `node_modules` can break tools that assume hoisting (Remotion,
     Prisma, Playwright), and `onlyBuiltDependencies` must be maintained; one more tool (pnpm) for
     `scripts/install.sh` to provide.
2. **Turborepo over npm workspaces, exactly as eng-grafo.**
   - Pros: zero divergence from the reference; npm ships with Node.
   - Cons: every absorbed `@ace/*` package would need its `workspace:*` dependencies and lockfile
     converted before it could run, which breaks "copy unchanged first" (D13).
3. **Keep extending `ai-creator-engine` in place (pnpm workspace, no Turborepo, no server).**
   - Pros: no migration; working `ace` flows stay untouched.
   - Cons: its ADR 0002 forbids a server and the Claude API; it has no web, api, watcher or
     database, and one format only. Rejected by D1.

Sub-decisions, each with the rejected alternative:

| Concern | Choice | Rejected, and why |
|---|---|---|
| Web | Next.js App Router in `apps/web` | Vite SPA: team standard is Next.js, and eng-grafo's session layout and middleware are reused |
| Api | NestJS + `@nestjs/cqrs` in `apps/api`: thin controllers validate with zod and dispatch to `CommandBus` / `QueryBus`; side effects in events | Next.js route handlers as the backend: domain APIs and LLM hosts belong in Nest modules; a plain service layer loses the eng-grafo command/query convention |
| Database | Prisma + SQLite, one file under `~/Library/Application Support/VideoStudio/db/` | PostgreSQL (as in `ai-creator-engine` ADR 0001): needs Docker or a daemon on a single-user Mac |
| Auth | One local passphrase stored only as a hash, httpOnly session cookie, api guard on every route except `health` and login (D8) | No auth on `127.0.0.1`: another local process or browser tab could start paid runs. Accounts and registration: single user, out of scope |
| Processes | launchd manages only `apps/watcher`; web and api run under `studio start` / `studio stop` (D9) | launchd for all three: two always-on servers and open ports the owner did not ask for |
| CLI | Ink CLI `studio` in `tools/cli`, reading the same run files as the web | Desktop shell (`.app`): not in R1 (D4) |
| Python tools | Port `video_tool.py` and `captions.py` to TypeScript commands in `packages/toolbox` (D15) | A Python package in the monorepo: a second runtime for the install script and for CI |
| Language | pt-BR interface and owner-facing docs; English code, identifiers and comments (D16) | English UI: the owner is the only user |

## Decision

We adopt Turborepo over pnpm workspaces with this layout:

- `apps/web` (Next.js App Router), `apps/api` (NestJS + `@nestjs/cqrs`, Prisma + SQLite),
  `apps/watcher` (run executor: a standalone Nest application context that boots the graph engine
  and the `agents` module, so runs never need the api; D17, ADR 0002), `tools/cli` (Ink, `studio`).
- Nest modules (`catalog`, `recipes`, `runs`, `agents`, `providers`, `costs`) live in a shared
  package or `apps/api/src` exported for reuse (**Assumption**: the SPEC fixes which), so the api,
  the watcher and the CLI run the same command handlers instead of duplicating logic.
- `packages/shared` (zod contracts for web, api, watcher and cli; absorbs `@ace/contracts`),
  `packages/ui` (CSS-variable tokens and React components), `packages/video` (absorbs `@ace/video`),
  `packages/toolbox` (absorbs `@ace/toolbox` and the ported Spesia tools), `packages/tsconfig`,
  `packages/eslint-config`.

The three reasons that decided it:

1. pnpm is what the code being absorbed already uses, so D13's "copy unchanged first" is literal.
2. The eng-grafo shape (Next.js + NestJS CQRS + Prisma SQLite + zod in `packages/shared`) is a
   working reference for exactly this kind of local, single-user app with cookie-session auth.
3. SQLite and a passphrase need no infrastructure, which keeps "one install command" (R1 goal 1)
   and offline mock runs (R1 goal 6) achievable.

Absorption plan (D13): `ai-creator-engine` keeps working in place, with its own git history, until
R1 meets its acceptance criteria. Its three packages are copied into `video-studio` unchanged
first; renames and refactors come only after the copies build. The SPEC fixes when `@ace/contracts`
becomes `packages/shared` and whether `ace` stays a user-facing binary next to `studio`. After R1
passes, the old repository is archived. Spec 0003 Part C validation, still pending there, is closed or carried over first.

The local voice stays an external process contract to the script in `ai-video-creator/ricardo-clone/`
(`ai-creator-engine` ADR 0004); no Python enters the monorepo.

**Assumptions**: the passphrase hash is argon2id or bcrypt through a maintained library, never
hand-rolled; the cookie is `SameSite=Lax` as in eng-grafo; pnpm is pinned through `packageManager`
and enabled by Corepack; `turbo.json` orchestrates `build`, `lint`, `typecheck`, `test` and `dev`
per workspace as in eng-grafo.

## Consequences

Relations: this ADR supersedes nothing in `video-studio`. It relates to `ai-creator-engine`
ADR 0001 (same NestJS, Next.js, Prisma, zod and provider-adapter ideas; PostgreSQL, Redis/BullMQ and
MinIO are not carried over). `ai-creator-engine` ADR 0002 ("no Claude API, no server") is
superseded for `video-studio` by ADR 0002 "Mastra + Claude API". The asset store and run files are
decided in ADR 0003 "Asset store and run format", not here.

Easier:

- Absorbed packages run on day one; contracts are shared by four consumers from one package.
- No Docker, no database server, no account system to install or operate.
- One language and one runtime (TypeScript on Node 22+) for install, build and review.

Harder:

- Two CQRS buses and event handlers are ceremony for a single-user app with few writers.
- SQLite allows one writer at a time. The database is written only through the Nest command
  handlers (by the api, or by the CLI booting the same modules); the watcher reads it and writes
  only run files (ADR 0003 "Who writes what"). WAL mode and a busy timeout cover the rare overlap of
  two writers on one Mac, and that split must hold.
- Until `ai-creator-engine` is archived, the same package source exists in two repositories and a
  fix must be applied to both.
- The TypeScript port must reproduce ffmpeg behaviour (music with ducking, fades, caption burn,
  review) from the Spesia report until the original Python files are located (PRD section 16).
- The owner must run `studio start` after a reboot; only the watcher returns by itself.

We commit to maintain: `turbo.json` and the pnpm workspace file; Prisma migrations applied by
`scripts/install.sh`; the api guard as a global default with `health` and login as the only
exemptions (acceptance criterion 27); web and api bound to `127.0.0.1` (criterion 23); the launchd
plist free of secrets.

Revisit triggers:

- A second user, or access from another machine, is requested: reopen passphrase auth and SQLite.
- A `SQLITE_BUSY` error appears in the logs in normal use, or the database file passes 1 GB:
  reopen SQLite versus PostgreSQL.
- More than 2 dependencies need hoisting workarounds or `onlyBuiltDependencies` entries beyond
  `esbuild`, Prisma and Playwright: reopen pnpm versus npm.
- A full cached `turbo build` gives no measurable saving over `pnpm -r build` after R1: drop
  Turborepo and keep plain pnpm.
- A toolbox command cannot match the Python tools' output within the recipe's QA limits (loudness
  ±1 LU, caption timing) after 2 attempts: reopen D15 with the owner.
- R1 has not met its acceptance criteria 60 days after the first copied package builds
  (**Assumption**): decide whether to keep both repositories or re-point `ai-creator-engine` at
  the monorepo packages.
- A packaged `.app` is approved for R3: reopen the launchd and `studio start` split.
