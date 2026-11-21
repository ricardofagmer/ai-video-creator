---
domain: general
risk: high
spec: docs/specs/0002-r1-studio-foundation.md
security_review: pending
---

# R1 rev 4: contract additions

## What
Implements the contract additions the R1 workers flagged as out of scope, as SPEC 0002 rev 4:
- C10 additions: watcher heartbeat, month spend, current stage per run, register by reference, a shared passphrase key and PHC pattern;
- the review player for cloned-voice videos;
- C6 optional declared outputs;
- C11 voice path.

## Why
These gaps block owner flows that R1 already exposes:
- the watcher indicator is inferred, not reported;
- registering a reference needs a CLI handoff;
- videos narrated with the cloned voice cannot be reviewed in the web;
- the reviewer verdict copies are written without being declared;
- the local voice cannot receive the registered voice path.

Risk is high because the change touches the session-guarded api surface and how biometric material is served.

## Ticket ledger
| Ticket | Status | Notes |
|---|---|---|
| SPEC rev 4 | written 2026-11-18 | `docs/specs/0002-r1-studio-foundation.md` rev 4 (section 13, tickets R1-24 to R1-27, R1-28 folded into R1-25, AC R4-01 to R4-16, A19-A30); ADR 0003 heartbeat note appended |
| R1-24 | integrated 2026-11-18 (DEGRADED) | C3, C4, C5, C6, C10, C11 rev 4 deltas in `packages/shared` and `docs/RUN-FORMAT.md` (watcher.ts, heartbeat schema and helpers with O_NOFOLLOW and 1 KiB cap, by-reference DTOs, `artifactAccess`, `monthSpendUsd`, `cursor`, `LocalVoiceJob`, `DeclaredOutput.optional`, shared passphrase key and PHC pattern, `API_CONTRACT_REVISION = 2`); scope check clean; frozen for R1-25 to R1-27; api and web typecheck red until they land; not compiled |
| R1-25 | integrated 2026-11-18 (DEGRADED) | api rev 4 plus folded R1-28: `GET /watcher` (heartbeat only, no pid), `monthSpendUsd` (5 s reuse, null on failure), run-list `cursor`, both by-reference routes with the six-step path validator (lexical checks before any fs call, then realpath equality), `artifactAccess` computed and enforced on the artifact route, `no-store` with ETag off, passphrase key and PHC pattern imported from shared (one copy each); scope check clean; not compiled |
| R1-26 | integrated 2026-11-18 (DEGRADED) | watcher rev 4: `HeartbeatWriter` (2 s unref'd timer from bootstrap, C5 helper only, no pid, never deletes, one rate-limited warning per outage, stops at context close); optional declared outputs honoured by execute postcondition, verify checks and record step; package declares the three `qa/review-<subject>.json` copies optional; C11 `voice` read by ref from `context.assets`, written only into the 0600 job file and deleted in `finally`; scope check clean (no as/any); not compiled |
| R1-27 | integrated 2026-11-18 (DEGRADED) | web rev 4: three rev 4 routes allowlisted in the BFF route table; `ShellWatcherIndicator` reads `GET /watcher` every 2 s; `MonthSpendMeter` (null shows "indisponível"); "Etapa atual" column; by-reference form posts to the new routes (also for version N+1), `ReferenceImportPanel` deleted; playback driven by `artifactAccess` with a web-local `BiometricVideoPlayer` (nodownload, no PiP, no remote playback, no link); BFF now passes the api's nosniff and CSP through; scope check clean (no as/any/dangerouslySetInnerHTML; hex hits are pre-existing brand-kit seed values); not compiled |

## Checklist
- [x] SPEC 0002 rev 4 written, with the contract delta and tickets
- [x] Shared contracts frozen by one owner before dependent writers start (R1-24)
- [x] api, watcher and web rev 4 tickets integrated by read-only inspection (R1-25 to R1-27, all DEGRADED, not compiled)
- [ ] Security review at the final gate (biometric streaming, by-reference path validation, heartbeat route) -- OPEN: never run. Every later review covered only changes after the baseline commit `c52a849`, which holds this code. Tracked as system step "baseline security review and critic" (2026-11-21)
- [ ] Critic pass at the final gate (risk high) -- OPEN: never run. Every later review covered only changes after the baseline commit `c52a849`, which holds this code. Tracked as system step "baseline security review and critic" (2026-11-21)
- [x] Typecheck, lint, build and tests at R1-FP (R4 final gate 2026-11-20 ran the whole monorepo green: typecheck 13/13, lint 13/13, tests 11/11, build 10/10 (`2026-11-20-r4-implementation.md` line 29))

## Human decisions
2026-11-18 | Ricardo Fagmer | scope: "Contract additions (spec rev 4)" only; internal fixes, R1-FP and R2 planning not chosen | approved | this record
2026-11-18 | Ricardo Fagmer | decision mode: "Take defaults, record them (Recommended)" | approved | this record
2026-11-18 | Ricardo Fagmer | cloned-voice review: "Play for logged-in owner (Recommended)": the api streams the video only to the authenticated loopback session, never cached or copied; promote stays refused | approved | this record
2026-11-18 | Ricardo Fagmer (default taken) | SPEC 0002 rev 4 frozen with A19-A30 as written (A21 nullable month spend; A24 and A26 stricter than the brief); R1-28 folded into R1-25 | approved | docs/specs/0002-r1-studio-foundation.md rev 4
2026-11-18 | Ricardo Fagmer (default taken) | Q2: the api re-implements the biometric-run rule with `GetAssetVersionQuery` because core does not export `BiometricRunGuard`; month spend via `CostLedgerService.monthToDateUsd` | approved | spec rev 4 section 13
2026-11-18 | Ricardo Fagmer (default taken) | Q3: the prototype preview answer for rev 1 (declined) stands for rev 4 web scope; the design screens exist | approved | spec rev 4
2026-11-18 | Ricardo Fagmer (default taken) | Q1: whether the external voice script reads the `voice` key is confirmed by the owner before the live narration check at R1-FP | pending owner | spec rev 4 section 13.7
2026-11-18 | Ricardo Fagmer (default taken) | R1-24: `mimeTypeForFileName` returns `string | null` (spec 13.1 wins over the brief); response fields are required keys with nullable values | approved | spec rev 4 section 13.1
2026-11-18 | Ricardo Fagmer (default taken) | R1-25: lexical path checks (data home, home or /Volumes, dot segments) run before any fs call and again after realpath; a folder containing the data home is refused | approved | apps/api/src/catalog/reference-path.validator.ts
2026-11-18 | Ricardo Fagmer (default taken) | R1-25: on playable-biometric and withheld runs every artifact not served as JSON or text counts as media (fail closed); unreadable run.json withholds | approved | apps/api/src/runs/artifact-access.policy.ts
2026-11-18 | Ricardo Fagmer (default taken) | R1-25: unknown extension without mimeType answers 422 reference-mime-type-unknown after all path steps pass; untyped core inspection errors become path-free ReferenceRegistrationFailedError | approved | apps/api/src/catalog/catalog-reference.service.ts
2026-11-18 | Ricardo Fagmer (default taken) | R1-25 open for R1-FP and security review: realpath/lstat vs core ReferenceInspector time-of-check race; artifactAccess runs up to ~230 catalog reads per 1 s poll with no cache; rev 3 RunStateResponse.watcher still probes the pid via shared readWatcherState | pending | this record
2026-11-18 | Ricardo Fagmer (default taken) | R1-26: heartbeat uses the engine CLOCK via the re-exported ports module, 60 s warning gap, stops at context close (keeps beating through the SIGTERM grace window); engine pt-BR texts go in engine/owner-texts.ts | approved | apps/watcher/src/daemon/heartbeat-writer.ts
2026-11-18 | Ricardo Fagmer (default taken) | R1-26: voice path taken from the preflight ResolvedAsset rather than re-resolved, so core does not re-hash the biometric file | approved | apps/watcher/src/stages/voice/narration-voice.ts
2026-11-18 | Ricardo Fagmer (default taken) | R1-26 open: mock package.behaviour.ts declares no verdict copies (R4-14 on the mock fixture); a stale verdict copy from an earlier package attempt would be hashed; music.executor.ts:61 forwards a bound music absolutePath without a biometric guard (pre-existing, for security review); confirm the double ports-module import is one instance at R1-FP boot | pending | this record
2026-11-18 | Ricardo Fagmer (default taken) | R1-27: the `studio catalog import` help text is removed entirely (spec R4-16 wins over the brief); evidence links and promote only on `playable` runs; no mimeType sent by the web; biometric player also blocks the context menu and remote playback | approved | apps/web/src/features/review
2026-11-18 | Ricardo Fagmer (default taken) | R1-27 open: `packages/ui` VideoPlayer has no controlsList prop and an unconditional fallback link, so a web-local player is used (design gap for a later revision); BFF header pass-through in proxy.ts goes to the security review | pending | this record
2026-11-18 | Ricardo Fagmer | R1-FP after rev 4: "Not yet (Recommended)"; installs, checks, security review and critic stay deferred until the owner reopens them | deferred | this record
2026-11-18 | Ricardo Fagmer | R1-FP check plan (vet ranges, pnpm install, build, typecheck, lint, test) presented after "Yea": "Skip for now"; nothing installed or run | deferred | this record
