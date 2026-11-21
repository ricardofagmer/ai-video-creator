# 0006. Keep traces in local files and add an on-demand OTLP JSON file export

Date: 2026-11-19
Status: accepted (owner, 2026-11-21). The owner chose option 2 (on-demand OTLP JSON file export) on 2026-11-19 (SPEC 0006 Q2, "On-demand OTLP file (Recommended)").

Decider: Ricardo Fagmer. The decision is the owner's, made on 2026-11-19
(SPEC 0006 Q2). Sources: PRD 0001 (`docs/prds/0001-video-studio.md`) section 12 ("Local-only ...
No remote access, no telemetry"), AC 21, AC 22; ADR 0002; ADR 0003; SPEC 0001
(`docs/specs/0001-agent-topology.md`) section 10 ("OpenTelemetry export is decided for R2");
SPEC 0004 (`docs/specs/0004-curator-agent-topology.md`) section 10 ("Local files; OTel to R3");
SPEC 0006 (`docs/specs/0006-r3-outside-signals-and-packaging.md`) section 9 (R3-09);
`docs/RUN-FORMAT.md` sections 11, 15 and 23.

Statements marked **Unverified** were not confirmed against the OpenTelemetry specification in
this pass.

## Context

The decision has been deferred twice (R1 to R2, R2 to R3). What exists today (**Fact**, from the
specs and `docs/RUN-FORMAT.md`):

- Ids: `runId`, `stepKey` (`stageId:step:attempt`), `sessionId` (the packet id of each agent
  call), `curationId`, `correlationId` (the api's `x-request-id`).
- Span nesting is already defined: run > stage > step > agent session > model call or tool call;
  curation > step > session > model call. Each carries role, model id, packet id and an outcome.
- Where it goes: `runs/<id>/events.jsonl`, `runs/<id>/sessions/<sessionId>.jsonl` (redacted),
  `curations/<id>/events.jsonl` and `session.jsonl`, `logs/*.jsonl` (pino JSON), `cost.json`
  (tokens and USD per session). Nothing leaves the Mac.
- Rules already binding on those files: no secret, no PII, no body, note, prompt or proposal text
  in logs and events; biometric paths never logged.

So the data of a trace exists; what does not exist is the OpenTelemetry *shape*, and therefore no
standard viewer (a waterfall of a run, with durations and token counts per span) can open it.

Forces:

- One user, one Mac. There is no fleet, no on-call, no service-level objective to monitor.
- PRD 12 forbids telemetry leaving the machine. Any export must stay on the Mac by construction,
  not by configuration discipline.
- The watcher is the single writer of run files and must not gain a failure mode, a network
  dependency or a slow path because a collector is down.
- Prompts, briefs, scripts, review notes and biometric paths must never become span attributes.
- Every new dependency in the watcher is supply-chain surface (`rules/security.md`).

## Options considered

1. **Local files only; close the question.** Nothing is built. The JSONL files stay the only
   trace.
   - Pros: zero work, zero dependency, zero new risk; honest about a single-user tool.
   - Cons: no waterfall view; comparing where time and tokens went across steps means reading
     JSONL by hand or with `jq`; the question may come back a fourth time.
2. **On-demand OTLP JSON file export, derived from the existing files.** A pure mapper turns one
   run's (or curation's) `events.jsonl` and session end lines into OpenTelemetry spans and writes
   one OTLP JSON file when the owner runs `studio traces export <id> --out <file>`. The owner can
   load that file into any local viewer that accepts OTLP JSON (**Unverified**: which viewers
   import a file directly; some need a collector with a file receiver).
   - Pros: no SDK and no dependency (the OTLP JSON encoding is plain JSON); no network code at
     all; no change to the watcher, the api or any writer; the JSONL files stay the source of
     truth and the export can be regenerated or deleted at will; the attribute allowlist is one
     function that can be read and tested.
   - Cons: not live, a run is exported after the fact; the mapper must be kept in step with the
     event vocabulary; viewing still needs a tool the owner installs separately; trace and span
     ids must be derived (for example from hashes of `runId`, `stepKey` and `sessionId`) because
     the files do not store OpenTelemetry ids.
3. **Optional live OTLP export to a collector on loopback.** The OpenTelemetry SDK runs inside the
   watcher and the api and sends spans over OTLP/HTTP to `127.0.0.1:4318`, off by default, enabled
   by a setting.
   - Pros: live waterfall while a run executes; standard instrumentation; the same pipeline could
     later feed metrics.
   - Cons: several SDK packages enter the watcher and the api (vetting, pinning, upgrades); the
     default resource detectors attach host name, process command line and process owner, which
     here contain the user name and absolute paths, so they must be disabled and that must stay
     disabled across upgrades; a collector endpoint is configuration, and a mistyped or changed
     endpoint is exactly the "telemetry leaves the machine" failure PRD 12 forbids, so the
     exporter must refuse any host that is not loopback; the owner must install and run a
     collector and a viewer; export failures must never slow or fail a step.
4. **Export to a hosted observability backend.**
   - Rejected: it sends run metadata off the Mac, against PRD 12, for a single-user tool.

## Privacy rules (binding on options 2 and 3)

Span and resource attributes come from an allowlist; anything not on it is not exported.

| Allowed | Examples |
|---|---|
| Ids | `runId`, `stageId`, `stepKey`, `sessionId`, `curationId`, `scheduleId`, `correlationId` |
| Names from closed vocabularies | stage and step names, role, model id, provider name, check ids, reason ids, outcome |
| Numbers | durations, attempt numbers, token counts (input, output, cache read, cache write), USD, counts of checks and recoveries |
| Versions | prompt and skill `ref@version`, recipe ref, instruction version |
| Resource | `service.name` (`video-studio-watcher`, `video-studio-api`) and `service.version` only |

Never exported, in any option:

- Prompt, packet, system or output text; brief text; script, scene or plan text; review notes;
  learning notes; proposal text and diffs; run and schedule titles.
- Any file path (asset paths, reference paths, and above all biometric paths under
  `ricardo-clone/`), host name, user name, process command line, environment variables.
- Published video URLs and platform video ids; platform metric values.
- The passphrase, session cookies, provider keys or any header.
- Error messages as free text: only the error name or reason id.

A span event may say that a redaction happened and how many items were redacted, never what.

## Decision

**Accepted by the owner (SPEC 0006 Q2):** option 2.

1. Traces stay in the local files that exist today. They remain the source of truth.
2. Add one pure mapper (`packages/shared/src/telemetry/`) and one CLI command
   (`studio traces export <runId|curationId> --out <file>`) that write an OTLP JSON file from
   those files, using the attribute allowlist above. The command writes only the file the owner
   names, refuses to overwrite without `--force`, and makes no network request.
3. No OpenTelemetry SDK, no exporter and no collector endpoint enter the watcher or the api.
4. Option 3 is not built now. If it is ever taken, it must be off by default, accept only
   `127.0.0.1` and `[::1]` as the collector host, disable every resource detector, apply the same
   allowlist, and never block or fail a step when the collector is unreachable.

Deciding reasons: the trace data already exists and is already governed by the privacy rules; a
file export gives the waterfall view when it is wanted without adding any code path that can send
data anywhere; and the watcher, the one process whose failure stops runs and schedules, stays
untouched.

Honest cons of the recommendation: it is not live, so it does not help while a run is stuck; it
is only as useful as the viewer the owner chooses to install, and file import support varies by
viewer (**Unverified**); and for a single-user tool option 1 is equally defensible. If the owner
has no concrete use for a waterfall view today, option 1 costs nothing and this ADR's revisit
triggers say when to come back.

## Consequences

Easier:

- A run or curation can be inspected as a span tree in a standard tool, on demand.
- The privacy boundary of the export is one allowlist in one file, testable without a network.
- The decision stops being carried from release to release.

Harder:

- The mapper must follow every change to the event vocabulary of `docs/RUN-FORMAT.md`; a new
  event type that is not mapped is silently absent from the export unless the mapper counts and
  reports unmapped lines (it must).
- Derived span ids must be stable, so that two exports of one run are identical.
- The exported file is a new artifact the owner can copy elsewhere; it must contain nothing the
  allowlist forbids, which the final-gate tests of SPEC 0006 R3-09 must prove with a fixture that
  plants forbidden text in the source files.

We commit to maintain: no outbound telemetry of any kind; the allowlist as the only source of
exported attributes; the JSONL files as the source of truth.

## Revisit when

- A run stalls or slows in a way the JSONL files and an after-the-fact export could not explain
  within one working session: reopen option 3 (live loopback export).
- The studio gains a second user, a second machine or any shared deployment: reopen the whole
  ADR; PRD 12 would be reopened first.
- The export is not used in the release after it ships: remove the command and record option 1.
- The OTLP JSON encoding or the chosen viewer drops file import (**Unverified** stability of the
  file format): reopen option 2 versus option 3.
