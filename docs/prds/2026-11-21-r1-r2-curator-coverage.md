# PRD: R1, R2 and curator test and eval coverage

Date: 2026-11-21
Status: draft (super-dev prepare; approval is recorded at review)
Feature slug: `r1-r2-curator-coverage`
Parent PRD: `docs/prds/0001-video-studio.md`

## Problem

The critic pass of 2026-11-21 refuted the claim that R1, R2 and the curator are verified (critic
major 2, `.engineos/changes/2026-11-18-r1-implementation.md` line 128): there are 0 test files under
the watcher engine and curation, or under core agents, curation, costs, review and runs. The 24
curator evals planned in `docs/specs/0004-curator-agent-topology.md` section 11 were never written,
and the topology v1 evals of `docs/specs/0001-agent-topology.md` section 11 were never written
either. The earlier "tests 11/11" ticks counted package test runners, not these criteria. Several
R1-FP items are still open (`2026-11-18-r1-implementation.md` lines 70 to 73).

## Users

- The owner (Ricardo), who needs evidence before calling R1, R2 and the curator done.
- Future development sessions, which need a regression net before changing these modules.

## Observable outcomes

- Each area named by critic major 2 has test files that run under the package's existing
  `test` script, with output shown at the final gate.
- The 24 curator eval cases and the topology v1 evals exist and pass with every provider faked.
- Each open R1-FP item is either proved by a check whose output is shown, or recorded as
  owner-run with the reason.
- No test touches the real data home, the macOS Keychain, the network, a live provider or
  `ricardo-clone/`.

## Non-goals

- No product behaviour change. A test that can pass only after a code change is reported as a
  finding, never fixed by weakening the test or by changing product code inside this run.
- No live provider runs (the topology v1 "live (opt-in)" suite stays owner-run).
- No database migration authored or executed; tests use throwaway migrated temp databases only.
- No new dependency; the existing `node --import tsx --test` runner is used.
- No web test runner (the web has no `test` script and no tsx; see open question OQ4).

## Requirements

1. **CR1 Harness.** A frozen test-support contract (core and watcher) gives every test an isolated
   temp data home with a migrated throwaway database, a mock watcher engine, fixture builders and a
   sentinel credential; one isolation test per package refuses forbidden patterns in test files.
2. **CR2 Watcher engine.** Tests cover the run state machine, step lifecycle, `control.json`
   pause, stop and resume handling, the fault scenarios, crash-resume at engine level, and the 4
   topology v1 loop evals (`ReviewVerdict` retry rules).
3. **CR3 Watcher stages, adapters and daemon.** Tests cover stage executors under mock ports, the
   adapters, daemon pickup and resume, and the topology v1 end-to-end eval (run reaches `review`,
   manifest pins every ref, cost total equals the session sum, spend $0).
4. **CR4 Watcher curation.** Tests cover the watcher curation flow and the curator end-to-end eval
   (`prompt-narration-pt@3` sample; v4 saved as `draft` with provenance `curator`; nothing started).
5. **CR5 Topology v1 tool evals.** At least 20 goldens and 12 negatives over the four read-only
   agent tools (biometric exclusion, injection stays delimited, frame budget, caller allowlists,
   redaction).
6. **CR6 Topology v1 agent evals.** At least 5 per agent: the packet builder omits every
   "never sees" item, the output parses with the strict schema, every field the next hop consumes
   is present.
7. **CR7 Mastra assumptions.** A test confirms each of the six Mastra API assumptions of R1-13
   against the installed Mastra version.
8. **CR8 Curator evals.** The ground check (9), Curator (6), Scriptwriter (4) and Scene director (4)
   cases of topology 0004 section 11; with CR4 that is 24.
9. **CR9 Core R1 data.** Tests cover catalog, recipes, runs, review, outcomes, costs, seed
   (idempotency on a synthetic seed root: created, then unchanged) and providers.
10. **CR10 Core R2 loop.** Tests cover quality, embeddings, promotion, learnings and comparisons.
11. **CR11 api routes.** Tests cover the api routes: session and authorization, object-level
    access, input validation, run control and heartbeat, by-reference path validation.
12. **CR12 CLI and toolbox.** Tests cover the CLI commands and the toolbox; the toolbox gains a
    `test` script with the same runner.
13. **CR13 Safety.** Every provider is faked; no test reads the real home directory data, the
    Keychain, the network or `ricardo-clone/`, spawns a real provider process or uses `.only`;
    no existing test is weakened or deleted.
14. **CR14 Final proof.** Build, typecheck, lint, test, `studio --help`, `scripts/install.sh
    --dry-run` with a temp `VIDEO_STUDIO_HOME`, shellcheck and `dev:fixture` run at the final gate
    with output shown, and a coverage ledger maps every critic-major-2 area, eval count and R1-FP
    item to its test file and result.
15. **CR15 Owner-run items.** Items that need real biometric files, real binaries or a live
    session (real catalog seed, mock runs through the real executors, the Next 15 assumptions, the
    R1-04 fixture pins, the live suite) are recorded in the ledger as owner-run with the reason,
    never faked as passed.

## Acceptance

- Every requirement above maps to at least one ticket (traceability matrix in the spec).
- The final gate shows the test output; the ledger counts at least 24 curator cases, at least
  20 goldens and 12 negatives for tools, at least 5 cases per topology v1 agent, 4 loop cases and
  1 topology v1 end-to-end case.
- No product source file outside the tickets' exclusive paths changes.

## Open questions

- **OQ1** The real catalog seed would hash files under `ricardo-clone/`. Default: owner-run;
  idempotency is proved on a synthetic seed root.
- **OQ2** Mock runs through the real executors need ffmpeg and Chromium. Default: owner-run.
- **OQ3** The 2 s pause check (AC 14) needs an isolated watcher, a migrated temp database and a
  passphrase. Default: attempted inside the harness; reported unavailable when a precondition is
  missing.
- **OQ4** `apps/web/src/lib/bff/fetch-site.test.ts` is run by no script (no web `test` script, no
  tsx in the web). Default: reported, not changed.
- **OQ5** The list of Next 15 assumptions (R1-19, R1-20) is missing from the repository. Default:
  owner-run.
- **OQ6** Regenerating or retiring the R1-04 fixture pins is the owner's call. Default: reported.
- **OQ7** Criterion 17 may be superseded by R4 publishing. Default: reported, not tested.
- **OQ8** Whether existing tool tests count toward the eval counts. Default: no; eval files are new
  `*.eval.test.ts` files.
