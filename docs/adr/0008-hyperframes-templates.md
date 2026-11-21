# 0008. Render HyperFrames templates as a second, gated engine behind the template engine discriminator; Remotion stays the default

Date: 2026-11-20
Status: accepted (owner, 2026-11-21). The owner approved the pin `hyperframes` 0.9.72 exact on
2026-11-20 (`docs/vetting/0005-hyperframes-dependency.md`). The owner answered SPEC 0008
questions OD4 to OD7 on 2026-11-20, each with the recommended answer this ADR is written under.

Decider: Ricardo Fagmer. Sources: PRD 0001 (`docs/prds/0001-video-studio.md`) D2, section 3 R4
goal 5, section 5.1, section 12, section 15; `docs/vetting/0004-hyperframes-spike.md` (pass, with
conditions); `docs/vetting/0005-hyperframes-dependency.md` (pin, tree, Chrome, section 6 "not
verified"); SPEC 0008 (`docs/specs/0008-r4-hyperframes-templates.md`); the code read on 2026-11-20
(branch `feat/r4-connected-platforms`), cited as `path:line`.

## Context

D2 names two template engines. Only Remotion renders today. The catalog already accepts
`engine: 'hyperframes'` (`packages/shared/src/catalog/kind-details.ts:11`) and the web form offers
it (`apps/web/src/features/catalog/asset-form/kind-detail-fields.ts:27`), but nothing reads the
field: the composition stage maps `compositionId` to a Remotion template and never looks at
`engine` (`apps/watcher/src/stages/executors/composition.executor.ts:83`). A template saved as
HyperFrames is either refused as "not renderable" or, if its composition id happens to be a
Remotion one, rendered by Remotion.

The spike (vetting 0004) showed that HyperFrames renders locally with no account and meets the
studio's render contract (H.264, yuv420p, CRF 18), and set five conditions. The dependency vetting
(vetting 0005) cleared the pin statically and left three things unverified, the main one being a
network trace of a render.

Forces:

- Local-only, no telemetry (PRD 12). The HyperFrames CLI has telemetry on by default, checks for
  updates, installs agent skills, names thirteen remote hosts in its bundle, and by default reads
  `~/.hyperframes`, which on the owner's Mac holds a HeyGen credentials file.
- HyperFrames has no programmatic render API. It is a CLI, so it is a child process, like the
  local voice.
- Its variables are flat scalars. The Remotion templates take a scene list.
- It is pre-1.0 and releases several times a day: any pin is stale in days.
- It drives its own `chrome-headless-shell` (158.0.8127.36, about 195 MB), fetched from Google's
  Chrome for Testing bucket on first use unless a binary is supplied.
- The existing Remotion path, its four renderable templates, both seed recipes and every past run
  must behave exactly as before. `packages/video` was absorbed unchanged (D13).
- Tests may not start Chrome or touch the Keychain.

## Decision

1. **A second engine behind the existing discriminator.** `TemplateDetails.engine` is the one
   switch. The composition stage dispatches on it: `remotion` keeps today's `render` request
   untouched; `hyperframes` sends a new `hyperframes-render` request to the same tool-runner child.
   An engine never renders the other engine's template, and nothing falls back from one to the
   other. `DEFAULT_TEMPLATE_ENGINE` is `remotion`.
2. **One new workspace package owns the dependency.** `packages/hyperframes`
   (`@studio/hyperframes`) is the only manifest that names `hyperframes`, at `0.9.72` exact. It
   holds the process contract: the pinned binary's path, the argv, the environment, the Chrome
   resolver, the sandbox profile and the output check. `packages/video` is not touched.
3. **A closed process contract.** Every HyperFrames process is started without a shell as
   `node <pinned bin>` (never `npx`, never a PATH lookup), with an environment built from a fixed
   list: the four privacy switches of vetting 0004, a studio-owned config dir, cache dir and
   `HOME` under `<data home>/hyperframes/`, and an explicit `HYPERFRAMES_BROWSER_PATH`. The parent
   environment is never passed.
4. **Renders run under `sandbox-exec` with outbound network denied except loopback** (SPEC 0008
   OD5, recommended answer). The same profile is used by the owner-run network trace that gates
   the engine, so the trace proves the configuration that later runs.
5. **The engine is off until the owner turns it on.** `<data home>/hyperframes/engine.json` starts
   absent, which means disabled. `studio hyperframes enable` refuses unless a passing trace record
   exists for the current pin, Chrome build and sandbox profile. A changed pin, Chrome or profile
   makes the trace stale and the engine refuses again.
6. **Chrome is a studio-owned, owner-approved download** (OD4, recommended answer):
   `<data home>/hyperframes/cache/`, filled only by `studio hyperframes chrome install` after a
   typed confirmation. A render that finds no binary stops and says so; it never downloads.
7. **Templates are self-contained folders with flat props.** `sceneSchema` is null, `inputSchema`
   is a flat JSON Schema of scalars, files reference only paths inside the folder, and every
   render passes `--strict` and `--strict-variables`. Values come from a closed studio vocabulary
   and the recipe's stage parameters (OD6, recommended answer); no agent fills them.
8. **Picture from HyperFrames, sound from ffmpeg.** HyperFrames renders the picture; the tool
   runner muxes the narration with the ffmpeg the studio already uses. Audio through a HyperFrames
   render was never verified (vetting 0004 section 4).

Deciding reasons: the discriminator already exists in the catalog, so the seam is one `switch`
and one new request type; a separate package keeps a 75-package tree and a child-process contract
out of the absorbed Remotion package; and a sandbox plus a per-pin trace turns "the flags are
believed to stop the network" into something observed.

## Options considered and rejected

### A. HyperFrames only as an offline export tool

The owner would run `hyperframes render` by hand (or a `studio` wrapper) and upload the MP4 as a
`reference` or `image` asset; no run would render through it.

- For: no engine dispatch, no gate, no new failure modes in a run.
- Rejected: it does not deliver PRD R4 goal 5 ("template support next to Remotion"). A hand
  render has no recipe, no manifest entry, no hash trail and no quality score, which is the
  one-off folder problem the studio exists to end (PRD section 1). It would still need the same
  pin, privacy environment and trace.

### B. Reject HyperFrames and record the reason

Allowed by PRD goal 5 if the spike had failed.

- For: zero new supply-chain surface (75 packages, a second Chrome build), nothing to re-vet.
- Rejected: the spike passed, every condition it set is buildable, and D2 names the engine. The
  costs are real and are listed under "Harder" below; they are bounded by the gate, not removed.

### C. HyperFrames inside `packages/video`, next to Remotion

- For: one "video" package, no new workspace entry.
- Rejected: `packages/video` is the absorbed `@ace/video`, kept unchanged (D13), and exports a
  Remotion API. Adding a CLI child-process contract and its tree there changes what every importer
  of `@ace/video` installs and makes the Remotion regression claim harder to show by diff.

### D. A general template-engine port with pluggable engines

A `TemplateEnginePort` with `remotion` and `hyperframes` adapters and a registry.

- For: a third engine would plug in.
- Rejected for now: there are two engines and one caller. The two paths share little (scene list
  and in-process API on one side, flat variables and a sandboxed child on the other), so the port
  would be an abstraction over one `switch`. Revisit trigger below.

### E. Let the writer agent fill the template's variables

- For: richer, per-video text in each variable.
- Rejected for this release: it changes the agent packet contract (C7) and the approved topology,
  and puts model output into a file a renderer reads. OD6 keeps it as an option the owner can
  choose; it would need its own review.

### F. Trust the environment switches, no sandbox

- For: no dependence on `sandbox-exec`, which Apple marks deprecated.
- Rejected as the recommended answer: whether `HYPERFRAMES_NO_TELEMETRY` and
  `HYPERFRAMES_NO_UPDATE_CHECK` stop the calls in 0.9.72 was not traced (vetting 0005 section 6),
  and a template is HTML and JavaScript running in a browser. OD5 keeps "trace once, then run
  unsandboxed" as the owner's alternative.

## Consequences

Easier:

- A template can be authored as plain HTML and CSS, without a React build.
- The Remotion path is provably unchanged: its request schema, mapper and package have no diff.
- Turning the engine off is one command and needs no deploy; an unset gate is "off".
- A new pin has a fixed checklist: vetting 0005 sections 1, 2 and 4, then the trace.

Harder:

- A second render stack to keep alive: 75 packages, a second Chrome build (about 195 MB beside
  Playwright's and Remotion's), and a CLI whose flags and environment names can change in any
  release. The pin will be old within days; staying on it is a choice the owner repeats.
- HyperFrames templates are limited: flat variables, no scene list, no captures, no per-scene
  timing. A template that needs scenes stays on Remotion. In a run the director still writes
  scenes that a HyperFrames render ignores.
- The engine gate is checked at the composition stage, so a run with a HyperFrames template and a
  disabled engine stops after the script and narration were paid for.
- `sandbox-exec` is deprecated by Apple and its profile language is not documented. If a macOS
  release removes it, the engine refuses to render (`sandbox-unavailable`) until this ADR is
  revisited.
- The trace proves one render of one template on one day. A different template can still try to
  reach the network; the sandbox denies it, and the render fails rather than leaks.
- Two unverified readings of the bundle are load-bearing: that `HYPERFRAMES_BROWSER_PATH` stops
  any Chrome download, and that a seeded config dir stops the copy from `~/.hyperframes`. The
  owner-run trace is where both are observed.

We commit to maintain: the exact pin and its vetting record; the closed environment list and the
sandbox profile (a change to either makes the trace stale); the rule that tests use a fake
process port and never start Chrome; the `@studio/shared/hyperframes` schemas as the executable
form of `docs/RUN-FORMAT.md` section 27.

Revisit when:

- A new pin is proposed, an advisory lands for a package in the tree, or upstream stops
  publishing with provenance (vetting 0005 section 8).
- HyperFrames ships a programmatic render API: reconsider the child-process contract.
- HyperFrames reaches 1.0 or slows its release cadence: reconsider how often the trace is rerun.
- macOS removes or breaks `sandbox-exec`: choose between an unsandboxed engine with the trace as
  the only control (option F) and turning the engine off.
- A third template engine is proposed, or a second caller needs to render a template: build the
  port of option D.
- The owner wants scene-driven or agent-written HyperFrames templates: reopen OD6 with a topology
  review.
- No HyperFrames template is used in a run for 90 days after the engine is enabled: remove the
  package and record the rejection, as PRD goal 5 allows.
