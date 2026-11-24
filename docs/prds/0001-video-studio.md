# PRD 0001 — Video Studio (working name)

Status: draft, 2026-11-18. Open questions answered by the owner on 2026-11-18 (D5-D16); awaiting
final review.
Owner/decider: Ricardo Fagmer.

Sources:

- Owner request (2026-11-18): "using the idea of this architecture [eng-grafo], we need create PRD to
  scaffold a system to install in mac following this eng-grafo, to create video creator with ai
  builder, where we'll have a catalog creation where the user can upload the models and references
  put the prompts, skills, images and then apply the reference to the pipeline video creation, so
  we'll build our catalog and way to create videos with all assets always improving".
- eng-grafo reference architecture: `README.md`, `tools/README.md`, `tools/FORMATO.md`,
  `design/README.md` (read as reference only).
- `ai-video-creator/ai-creator-engine/`: `README.md`, `CLAUDE.md`, `docs/prds/0001-ai-creator-engine.md`,
  `docs/adr/0001..0004`, `docs/specs/0003-owner-clone.md`, `packages/{contracts,toolbox,video}`,
  `.claude/skills/fagmer-video-*`.
- A real past run: `ai-video-creator/video-pipeline-2026-11-17-spesia/` (`RELATORIO.md`, `brief.json`,
  `17_review.json`).

Statements marked **Assumption** were not stated by the owner or verified in the sources.

## 0. Decisions already made (not open)

| # | Decision |
|---|---|
| D1 | Home is a new eng-grafo-style monorepo at `ai-video-creator/video-studio/`. It absorbs `ai-creator-engine`: the `ace` toolbox, the Remotion templates, the contracts and the `fagmer-video-*` skills become packages and seed catalog items. |
| D2 | "Models" in the catalog means both video templates (Remotion/HyperFrames compositions, formats, style presets) and AI model assets (voice clones, avatars, LoRA/checkpoints, provider model configs such as ElevenLabs voices or video-generation models). |
| D3 | AI engine is Mastra agents calling the Claude API, hosted inside NestJS providers. This deliberately departs from `ai-creator-engine` ADR 0002 ("no Claude API, no server in R1") and needs a new ADR in `video-studio`. The API key comes from the environment or the macOS Keychain only, never from files, prompts or logs. Token cost is tracked per run. |
| D4 | Mac install is local web + CLI: one install script (Homebrew dependencies such as node and ffmpeg) sets up a local Next.js web, a NestJS api and a background watcher managed by launchd, plus an Ink CLI. No desktop shell in R1; a packaged `.app` may come in a later release. |
| D5 | Asset store, runs, database and logs live in `~/Library/Application Support/VideoStudio/` (`db/`, `assets/`, `runs/`, `logs/`), outside git. Biometric assets stay where they are and are referenced by path. |
| D6 | Package manager is pnpm with `workspace:*` dependencies (as in `ai-creator-engine`), with Turborepo on top. |
| D7 | No cloud video-generation or avatar provider in R1. R1 providers: Claude API, ElevenLabs, the local cloned voice, Playwright capture and Remotion. Cloud video-generation and avatar adapters arrive in R2. |
| D8 | The local web requires one passphrase, set at install and stored only as a hash, with an httpOnly session cookie as in eng-grafo. The api rejects unauthenticated calls even on `127.0.0.1`. |
| D9 | launchd manages only the watcher. The web and api start with `studio start` and stop with `studio stop`. |
| D10 | R2 semantic search uses a local embedding model; catalog text never leaves the Mac for embedding. |
| D11 | Default cost ceilings: `limits.costPerRunUsd = 3` and `limits.costPerMonthUsd = 60`, both editable. Reaching either puts the run in `waiting`. |
| D12 | R1 ships two recipes: "Product tour 16:9" (from the Spesia run) and "Tool Demo 9:16" (from `ai-creator-engine`). Hook videos stay outside the run state machine (ADR 0003 of `ai-creator-engine`) until R2. |
| D13 | `ai-creator-engine` keeps working in place, with its own git history, until R1 meets its acceptance criteria; its packages are copied into `video-studio` unchanged first. After R1 passes it is archived. |
| D14 | The R1 review form records a 1-5 rating, free-text notes and the 8-item publish checklist from `ai-creator-engine`, configurable per recipe. |
| D15 | The Spesia Python tools (`video_tool.py`, `captions.py`: music, fades, review, caption burn) are ported to TypeScript commands in `packages/toolbox`. No Python enters the monorepo; the local voice stays an external process contract. |
| D16 | Interface text and owner-facing docs in Portuguese (pt-BR); code, identifiers and code comments in English, as in eng-grafo. Amended 2026-11-23: the interface (web, shell menu, CLI) is also available in Spanish and English; pt-BR stays the source language (`design/glossario.md`). |
| D17 | The watcher boots the Nest `agents` module in-process as a standalone Nest application context, so runs never depend on the api being started (ADR 0002). |
| D18 | The watcher's engine owns the graph (phases, stages, fixed steps). Mastra agents and any small Mastra workflow run only inside one step; no Mastra storage or workflow suspend/resume (ADR 0002, ADR 0003). |

## 1. Problem

Each video today is a one-off folder (`video-pipeline-<date>-*`, or `runs/<date>-s<slot>-<slug>/` in
`ai-creator-engine`). The Spesia run shows the cost of that:

- The prompts, narration settings, music choice, caption style and the fixes found along the way
  (caption position for 16:9, loudness targets, whisper mis-hearings of "Spesia") live in one
  folder's `brief.json` and `RELATORIO.md`. The next video starts from memory.
- Assets are referenced by loose path or env var (`ELEVENLABS_VOICE_ID`, `music/683.mp3`,
  `../ricardo-clone/`). There is no record of which version of a template, voice or prompt produced
  which result.
- Nothing measures which assets work. A good prompt and a bad one look the same on disk.
- `ai-creator-engine` produces one format (English, 9:16, 70-90 s TikTok). The Spesia tour
  (pt-BR, 16:9, 110 s) had to borrow parts of it by hand "without changing its code".
- Production needs an open Claude Code session. Closing it stops the work, and there is no resume
  from an exact step.

## 2. Users

| User | Needs |
|---|---|
| Owner/producer (Ricardo) | Build and curate the catalog, start a video from a recipe, follow the run, review, approve or reject, rate the result. Publishes manually. |
| The agents (Mastra + Claude API) | Clear stage briefs, resolved asset versions, an allowlisted toolset, and a postcondition they cannot argue with. |
| Viewers (indirect) | Accurate, well-produced videos. Never see anything that was not approved by a person. |

## 3. Goals and non-goals per release

### R1 — Studio foundation: catalog, recipes, one pipeline, human gate

Goals:

1. One install command yields a working local web, api, watcher and CLI on a Mac.
2. A catalog where the owner uploads/imports templates, AI models, references, prompts, skills,
   images, music/sfx and brand kits, each with immutable versions and required metadata.
3. Recipes that pin catalog asset versions to a pipeline graph, and a "brief → run" flow.
4. A graph engine (fixed steps, tool-checked postconditions, recovery, pause/stop/resume, human
   gates) that runs in the watcher and survives closing the web and CLI.
5. Every run ends at a human approval gate with an MP4, a manifest of the exact asset versions
   used, a cost record and QA evidence.
6. Everything runs offline on mocks (no API key, no network).
7. `ai-creator-engine` is absorbed and its assets appear as seed catalog items.

Non-goals:

- No automatic public posting. A run ends at human approval; publishing is manual.
- No multi-user, accounts, cloud hosting or SaaS. Single user, single Mac.
- No AI-generated footage presented as product proof.
- No desktop shell or packaged `.app`.
- No curator agent, A/B comparison, embedding search or platform analytics (R2/R3).
- No training or fine-tuning of models inside the studio; the catalog registers existing ones.

### R2 — The improvement loop

Goals: catalog ranking from recorded outcomes; semantic search with embeddings; the curator agent
proposing new prompt/recipe versions; A/B comparison runs; learnings written back as catalog notes;
avatar assets and cloud video-generation adapters usable in recipes.

Non-goals: automatic promotion of any version (always a human decision); automatic posting;
multi-user.

### R3 — Outside signals and packaging

Goals: platform analytics imported as outcomes (manual import first); a packaged `.app` or menu-bar
shell if still wanted; scheduled runs that still stop at review.

Non-goals: unattended publishing; SaaS.

### R4 — Connected platforms and studio insights

Added 2026-11-19 from the owner's R4 interview. Platforms: YouTube, Instagram and TikTok.

Goals:

1. **Platform metrics through the APIs.** The watcher pulls metrics on a schedule for every video
   linked to a run publication, and records them as outcomes exactly like the R3 import (same
   snapshot store, same platform signal in the quality score). The R3 CSV and form import stay as
   the fallback.
2. **Assisted publishing.** After the owner's recorded approval, one explicit click per video and
   platform uploads the approved MP4 with its title, caption and tags, and records the publication
   link on the run. A failed upload says why and is never retried without another click.
3. **Connected accounts.** The owner connects each platform account with OAuth from the local web.
   Tokens live in the macOS Keychain only (section 12), are refreshed by the process that uses them,
   and are deleted when the owner disconnects the account.
4. **Studio insights.** A web page (pt-BR) and a `studio insights` command, both reading one core
   query, show the section 14 success metrics: runs reaching `review` without manual file repair,
   time from brief to `review` per recipe, share of catalog assets per run, cost per approved video
   and per month, rating trend per recipe, and videos published without recorded approval (target 0).
5. **HyperFrames, decided by a spike.** R4 starts with a feasibility spike. Template support next to
   Remotion is built only if the spike passes; otherwise the decision is recorded as rejected with
   its reason. Remotion stays the default.
6. **Spesia tools.** `video_tool.py` and `captions.py` (section 16, item 1) are located and their
   behaviour checked against the D15 TypeScript port in `packages/toolbox`; any gap is closed in
   TypeScript.

Non-goals: unattended or scheduled publishing (every upload needs a click after approval);
publishing a video without a recorded approval; publishing to any account other than the owner's;
platforms beyond YouTube, Instagram and TikTok; platform tokens in files, the database, run files
or logs; multi-user; SaaS.

R4 narrows the R1 non-goal "publishing is manual": the owner may publish from the studio with one
click per approved video. "No automatic public posting" still holds.

Open for the spec (they do not change the goals):

- Instagram publishing and insights need the owner's account switched to Business or Creator and a
  Meta developer app with review; TikTok's Content Posting API needs an app audit before public
  posts. Either can delay its own platform; the spec decides how R4 ships while one is pending,
  without blocking the other platforms.
- Each platform's OAuth must accept a loopback redirect to the api on `127.0.0.1`.
- API quotas per platform and the polling interval for metrics.
- Which section 14 metrics the run files and database already record, and which need new fields.
- A video made with biometric assets (cloned voice, avatar): the publish click is the per-action
  confirmation section 12 requires; the spec decides whether the dialog names those assets.
- Every publication is listed in the run report under "what left the machine" (section 12).

## 4. Concept map: eng-grafo → Video Studio

| eng-grafo concept | Video Studio | Notes |
|---|---|---|
| loop | Video project / run | One run produces one video version. A re-edit (Spesia v2) is a new run of the same project. |
| objective or ready-made specs | Brief + recipe | "From an objective" = the planner agent proposes the plan from a brief. "From ready specs" = a recipe supplies the stage briefs. |
| plano / fases | Production phases | Pre-production, Production, Post, Delivery. |
| etapa (one spec each) | Stage with one stage brief | Stages numbered continuously 1..N across the run. |
| `rascunho` → approve | Draft plan → owner approves | No stage executes before approval. |
| 7 fixed iteration steps | 7 fixed per-stage steps | Section 7.2. Same idea: fixed order, one postcondition each. |
| pós-condição checked by the tool | Postcondition checked by the engine | The agent's answer never decides success. |
| verificações (build, lint, types, tests) | Media QA checks | ffprobe format/duration, loudness and true peak, caption sync, black-frame scan, reviewer-agent score. |
| recovery session | Recovery agent | Structured answer `{ resolved, cause, whatWasDone, needsPerson, whatToDo }`; the postcondition decides. |
| aguardando você | Human review gate / "Waiting for you" | Also raised for auth errors, license doubts and anything only a person can decide. |
| proposta antecipada | Next stage prepared in parallel | While stage N executes, the brief for stage N+1 is drafted. |
| vigia | Watcher under launchd | Separate process; closing the web or CLI does not stop a run. |
| `controle.json` | `control.json` | `{ pause, stop, at }`. Pause finishes the current step; stop kills it and leaves it pending. |
| `eventos.jsonl` / `agora.json` | `events.jsonl` / `now.json` | Live run timeline, read by web and CLI alike. |
| `loop.json` + `plano.md` | `run.json` + `plan.md` | `run.json` is the source of truth for run state; `plan.md` is a human-readable export. |
| `sessoes/`, `verificacoes/` | `sessions/`, `checks/` | Raw agent session streams and the output of every check. |
| `limites.*` | `limits.*` | Attempts per step, recoveries per stage, session and command timeouts, cost ceiling per run. |
| `totais` (cost, duration, sessions) | `totals` | Cost split by provider (Claude tokens, TTS characters, render seconds). |
| `.devkit/` format shared by CLI and desktop | On-disk run format shared by web and CLI | Documented as a contract (`docs/RUN-FORMAT.md`), atomic JSON writes. |
| fake Claude (`claude-falso.mjs`) | Mock model and provider adapters | The whole graph runs without spending tokens. |
| git commits of proposal and delivery | Content-hash snapshots of inputs and outputs | A run is not a git repository; hashes give the same audit trail. |
| deploy milestones | Not in scope | The nearest equivalent, publishing, stays manual. |
| `design/` as visual source of truth | `design/` | Same fidelity rule for `packages/ui` and `apps/web`. |

## 5. The catalog

### 5.1 Asset kinds

| Kind | What it holds | Examples from existing work |
|---|---|---|
| `template` | Remotion or HyperFrames composition, canvas/format, style preset | `TOOL_DEMO`, `AI_BATTLE`, `AUTOMATION_BLUEPRINT`, hook compositions in `packages/video`; the Spesia `SpesiaDemo.tsx` tour as a 16:9 candidate |
| `ai-model` | Voice clone, avatar, LoRA/checkpoint, provider model config | ElevenLabs voice config; the local cloned voice referenced at `ai-video-creator/ricardo-clone/` |
| `reference` | Video, image, audio or style reference, with sub-kind | A reference clip, a screenshot set, a tone-of-voice sample |
| `prompt` | Versioned text with declared variables | Scriptwriter, reviewer and recovery prompts |
| `skill` | A packaged procedure (SKILL.md folder) | The 13 `fagmer-video-*` skills in `ai-creator-engine/.claude/skills/` |
| `image` | Logo, still, background, cover | Product logos, covers |
| `music` / `sfx` | Audio track or effect with license | Mixkit tracks with the license text and the date it was read |
| `brand-kit` | Colors, fonts, logo set, caption style, safe zones | The `videoSpec.brand` palette in `packages/contracts` |

### 5.2 Required metadata (every asset version)

`id`, `kind`, `name`, `version` (integer, immutable), `status` (`draft` | `active` | `deprecated`),
`tags`, `owner`, `createdAt`, `updatedAt`, `contentHash` (sha-256), `sizeBytes`, `mimeType`,
`provenance` (source URL or "created here", author, capture date), `license` (name, URL, date read,
allowed uses), `sensitivity` (`normal` | `biometric` | `third-party`), `usageCount`, `qualityScore`
(computed, section 8), `notes` (learnings), `embedding` (reserved in R1, populated in R2).

Kind-specific fields: `prompt` declares `variables[]` with types and defaults; `template` declares
canvas, fps, duration range and the input schema it accepts; `ai-model` declares provider, model id
reference (never a secret) and local path when the model is local.

### 5.3 Upload and import flows

- **Web upload**: drag a file or folder, fill metadata, save as version 1 (`draft`).
- **CLI import**: `studio catalog import <path> --kind <kind>` for folders and bulk imports.
- **Register by reference**: for assets that must not be copied (biometric voice/avatar material,
  large checkpoints), the catalog stores a path and a hash, not the bytes.
- **Promote from a run**: a prompt, brief or track that worked in a run is saved back to the catalog
  as a new version with the run as provenance.
- Uploads are validated at the boundary: allowlisted MIME types per kind, size limits, no path
  traversal, license/provenance required before a third-party asset can become `active`.

### 5.4 Versioning rules

1. A version is immutable once saved. Any edit creates version N+1.
2. Each asset has at most one `active` version per channel of use; promotion is an explicit action.
3. Deprecating a version never deletes it; past manifests must stay resolvable.
4. Recipes and manifests always pin `assetId@version` plus `contentHash`.
5. A missing or hash-mismatched asset blocks the run at the preflight step, with a named reason.

### 5.5 Seed from ai-creator-engine

`studio catalog seed` registers, as version 1 with provenance `ai-creator-engine`: the three
templates and the hook compositions, the brand palette, the 13 `fagmer-video-*` skills, the
ElevenLabs voice config (by reference to env/Keychain names) and the local cloned voice (by path
reference only). The Spesia run seeds one recipe candidate and its two music tracks with their
recorded Mixkit license.

## 6. Recipes

A recipe is a reusable, versioned combination of catalog asset versions bound to a pipeline graph:

| Field | Content |
|---|---|
| `graph` | Which stages run, in which phases, with which checks and limits |
| `bindings` | Slot → `assetId@version` (template, voice, prompts per agent, brand kit, music policy, references) |
| `format` | Canvas, fps, duration range, language, loudness target |
| `gates` | Where a human must decide (always the final review; optionally script approval) |
| `inputs` | What the brief must supply (topic, source URL or capture target, key messages) |

How the owner applies references to the pipeline:

1. Pick a recipe, or pick assets and save them as a new recipe.
2. Attach run-specific references (footage, screenshots, a style reference) and write the brief.
3. Review the resolved plan (stages, pinned versions, cost estimate) and approve it.
4. The watcher runs the graph; the owner answers gates.
5. Review the result, approve or reject, rate it. The manifest records what was used.

Recipes follow the same versioning rules as assets. R1 recipes (D12): "Product tour 16:9" (from the
Spesia run) and "Tool Demo 9:16" (from `ai-creator-engine`).

## 7. Pipeline graph

### 7.1 Phases and stages

Stage order follows `ai-creator-engine` (`research → verify → script → assets → narrate → render → qa`)
and the Spesia run's file order (capture → narration → composition → captions → fades → music →
review). A recipe may switch stages off (a hook video has no research).

| Phase | Stages | Executor |
|---|---|---|
| Pre-production | brief, research, verify (claims with evidence), script | Agents; the engine validates manifests |
| Production | capture / asset gathering, narration, avatar (R2+, optional) | `packages/toolbox` providers |
| Post | composition, captions, fades/motion, music with ducking | `packages/video` + toolbox |
| Delivery | technical QA, agent review, human review gate, package | Toolbox, reviewer agent, owner |

### 7.2 The fixed steps of every stage

| # | id | What it does | Postcondition (the engine decides) |
|---|---|---|---|
| 1 | `brief` | Agent writes or revises the stage brief from the recipe and prior outputs. A recipe-supplied brief skips the agent. | Brief file exists and validates against its zod schema |
| 2 | `preflight` | Resolve every bound asset version; check provider mode and credentials; estimate cost | All assets resolve with matching hash; estimate under `limits.costPerRunUsd` and the month's spend plus the estimate under `limits.costPerMonthUsd` |
| 3 | `snapshot` | Write the stage's input manifest (asset versions, hashes, parameters) | Input manifest exists and validates |
| 4 | `execute` | Run the stage tool or agent; start drafting the next stage's brief in parallel | Declared output files exist and are non-empty |
| 5 | `verify` | Run the stage's media QA checks; on failure repeat once, then a correction session | Every check passes |
| 6 | `archive` | Move brief, evidence and session logs to the stage's archive folder | Archive folder exists |
| 7 | `record` | Hash outputs; mark the stage delivered with duration, cost and step summary in `run.json` | — |

Step status: `pending`, `running`, `ok`, `warning` (succeeded after recovery), `failed`, `skipped`.
Run status: `draft` → `pending` → `running` → `waiting` / `paused` / `failed` / `interrupted` → … →
`review` → `approved` / `rejected`. `running` is only shown while the watcher's pid is alive.

### 7.3 Checks, retries, limits, gates

- **Checks** are per recipe. Baseline from real runs: container/codec/resolution/fps via ffprobe,
  duration inside the recipe range, integrated loudness within ±1 LU of target and true peak under
  the ceiling (Spesia: −16 LUFS, ≤ −1 dBFS; hooks: −14 LUFS, ≤ −1.5 dBTP), no black run over 1 s,
  caption timing against narration, reviewer-agent score at or above the recipe threshold.
- **Recovery**: an auth error goes straight to `waiting`. Otherwise the recovery agent gets a
  bounded number of sessions per stage; the step reruns up to `limits.attemptsPerStep`; the same
  error after a recovery ends the attempts. Exhausted → step `failed`, run `failed` with a reason.
- **Never retried automatically**: license or rights doubts, claims without evidence, anything
  touching biometric assets, cost ceiling reached. These become `waiting` with what to do.
- **Human gates**: plan approval, the final review (always), and any gate the recipe adds.
- **Pause / stop / resume** through `control.json`; resume continues from the exact step.

### 7.4 Outputs of a run

`final.mp4`; `manifest.json` (every `assetId@version` + hash, recipe version, parameters, model ids);
`cost.json` (Claude input/output and cache tokens and USD per session, TTS characters, render
seconds, total);
`qa/` (check outputs, review JSON); `report.md` (what was made, decisions, what left the machine,
what to listen for); the approval record (who, when, checklist, rating).

## 8. The improvement loop ("always improving")

1. **Record** (R1): every run stores the asset versions used and its outcomes: human decision and
   rating (1-5 plus free-text notes), reviewer-agent scores, QA metrics, number of recoveries, cost
   and duration. `usageCount` is updated.
2. **Rank** (R2): `qualityScore` per asset version is computed from the outcomes of runs that used
   it. The catalog sorts and filters by it. The formula is documented and shows its sample size.
3. **Propose** (R2): the curator agent reads outcomes and notes and proposes a new prompt or recipe
   version, with the reason and the evidence runs.
4. **Compare** (R2): an A/B comparison runs the same brief with version A and version B and shows
   both results, scores and costs side by side.
5. **Promote** (R2): a new version becomes `active` only by an explicit owner approval. No agent,
   score or schedule promotes anything.
6. **Write back** (R2): learnings are saved as catalog notes on the asset version (for example:
   "captions at 74% height cover app buttons on 16:9").
7. **Outside signals** (R3): platform analytics are imported as further outcomes.

## 9. Agents

Candidate Mastra agents, each hosted in a NestJS provider and called with the Claude API:

| Agent | Responsibility |
|---|---|
| Planner | Turns a brief and a recipe into the run plan (phases, stages, checks, cost estimate). |
| Scriptwriter | Writes the script and per-scene narration against the template's input schema. |
| Scene director | Maps script scenes to captures, assets, camera moves and on-screen text. |
| Reviewer | Scores the result against the recipe's rubric; produces evidence, never the pass decision alone. |
| Recovery | Diagnoses a failed step and attempts one bounded fix; reports whether a person is needed. |
| Curator (R2) | Proposes new prompt/recipe versions and A/B comparisons from recorded outcomes. |

**This is a multi-agent system.** The topology (which agents exist, who calls whom, shared state,
handoffs, tool allowlists per agent, failure and escalation paths) must be designed and approved
before any multi-agent workflow code is written: EngineOS `/engineos:design-agents`, human-in-the-loop
reason `topology-approval`. The table above is a candidate list, not an approved topology. The graph
engine, catalog and mocks do not depend on that approval and may be built first.

## 10. Architecture overview (mirrors eng-grafo)

```text
video-studio/
├── apps/
│   ├── web/              Next.js (App Router): catalog, recipes, runs, live timeline, review
│   ├── api/              NestJS + @nestjs/cqrs; Prisma + SQLite; serves the web
│   └── watcher/          Standalone Nest context: graph engine + Mastra agents module; launchd
├── tools/
│   └── cli/              Ink CLI (`studio`): same run format as the web
├── packages/
│   ├── shared/           zod contracts web ↔ api ↔ watcher ↔ cli (absorbs `@ace/contracts`)
│   ├── ui/               Design tokens (CSS variables) and React components
│   ├── video/            Remotion templates (absorbs `@ace/video`)
│   ├── toolbox/          `ace`: capture, narration, render, QA (absorbs `@ace/toolbox`)
│   ├── tsconfig/         Shared TypeScript configs
│   └── eslint-config/    Shared ESLint flat configs
├── design/               Visual source of truth: tokens, components, screens
└── docs/                 prds/, adr/, specs/, RUN-FORMAT.md
```

- **Monorepo**: Turborepo over pnpm workspaces (D6).
- **API**: thin controllers that validate with zod and dispatch to `CommandBus` / `QueryBus`;
  side effects in events. Modules (**Assumption**): `catalog`, `recipes`, `runs`, `agents`,
  `providers`, `costs`, `health`.
- **State**: SQLite (Prisma) holds the catalog, recipes, outcomes and an index of runs. The run
  folder holds live run state (`run.json`, `now.json`, `events.jsonl`, `control.json`), with one
  writer at a time through atomic writes: the watcher while it runs, the api or CLI only for
  drafts, control requests and the review decision (ADR 0003 "Who writes what"). Web and CLI read
  the same files, so either can start, follow, pause or resume a run the other created.
- **Asset store**: local files, content-addressed by sha-256, outside git, under
  `~/Library/Application Support/VideoStudio/assets/` (D5).
- **Provider adapters**: every external service (Claude, ElevenLabs, local voice, capture, future
  video generation) sits behind an interface with a mock and a live adapter, selected per provider.
  With all providers on mock, the full graph runs offline at no cost.
- **Local voice**: stays a process contract to the script in `ai-video-creator/ricardo-clone/`
  (ADR 0004 of `ai-creator-engine`); no Python enters the monorepo. The Spesia Python tools are
  ported to TypeScript in `packages/toolbox` (D15).
- **Access**: one local passphrase (D8); the api guard checks the session cookie on every route
  except `health` and login.

## 11. Mac install and run

> **Amended 2026-11-23** by PRD `docs/prds/2026-11-23-desktop-installer.md` and ADR 0010
> (`docs/adr/0010-desktop-installer-and-hosted-portal.md`). The documented install is now a `.dmg`
> holding a self-contained app with a first-run setup that replaces `scripts/install.sh` steps 6
> to 15. `scripts/install.sh` stays as the development install from a source checkout. The table
> below is the R1 behaviour and is left as written.

| Topic | R1 behaviour |
|---|---|
| Prerequisites | Apple Silicon Mac (**Assumption**; the owner's machine is an M-series per spec 0003), Homebrew, Node 22+, ffmpeg/ffprobe |
| Install | `scripts/install.sh`: checks the architecture, installs missing Homebrew dependencies after listing them, installs workspace dependencies, builds, applies Prisma migrations, creates the data folders, installs the Playwright browser, registers the launchd agent, links the `studio` CLI. Safe to rerun. |
| Secrets | The script never asks for or stores keys in files. `studio secrets set <name>` writes to the macOS Keychain; environment variables override. Without keys the studio runs on mocks. |
| Watcher | A launchd user agent (`~/Library/LaunchAgents/`, label **Assumption** `com.videostudio.watcher`), restarted on crash and at login. Its plist holds no secret. |
| Web and api | Started with `studio start`, stopped with `studio stop` (D9). The install script asks for the local passphrase (D8) and stores only its hash. |
| Ports | Web and api on fixed local ports bound to `127.0.0.1`, configurable. **Assumption**: not 3000/4000, to avoid clashing with Remotion Studio and other local projects. |
| Data | `~/Library/Application Support/VideoStudio/` with `db/`, `assets/`, `runs/`, `logs/` (D5). Biometric assets stay where they are and are referenced by path. |
| CLI | `studio` (Ink, full screen) plus non-interactive commands: `status`, `run`, `pause`, `stop`, `resume`, `catalog import`, `catalog seed`, `secrets set`, `doctor`. |
| Uninstall | `scripts/uninstall.sh` unloads and removes the launchd agent and the CLI link. It keeps the data folder unless `--purge` is given, and never touches `ricardo-clone/` or Keychain entries without asking. |

## 12. Security and privacy

> **Amended 2026-11-23** by PRD `docs/prds/2026-11-23-desktop-installer.md` and ADR 0010
> (`docs/adr/0010-desktop-installer-and-hosted-portal.md`). "Local-only" below now has one
> exception: a hosted portal origin may read install status from the local api through the user's
> browser, on the install-status routes only. The api still listens on `127.0.0.1` only. The rest
> of this section is left as written.

- **Secrets**: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` and any provider key come from the
  environment or the macOS Keychain only. Never in the database, run files, prompts, logs, event
  streams, error messages or the launchd plist. A missing key in live mode fails at start with a
  named error; it never falls back to a literal.
- **Biometric assets**: the owner's voice and avatar material (`ai-video-creator/ricardo-clone/`)
  is local-only, registered by path and hash, never copied into the repository, never committed to
  git, never sent to a provider without an explicit per-action confirmation. `sensitivity:
  biometric` assets are excluded from exports and from agent-readable context.
- **Third-party references**: an uploaded reference carries license and provenance; without them it
  cannot become `active`. A reference is input for style and structure, not footage to republish.
- **Local-only**: web and api bind to `127.0.0.1`. No remote access, no telemetry. Loopback is not
  trusted on its own: every api route except `health` and login needs the passphrase session (D8),
  so another local process or browser tab cannot start paid runs.
- **Agent permissions**: eng-grafo runs each Claude session with `--dangerously-skip-permissions`
  plus a deny list. That pattern must not be copied blindly. Video Studio agents get an explicit
  per-agent tool allowlist, no shell tool, and file access limited to the run folder and resolved
  asset paths.
- **Untrusted content**: text from uploaded references, captured pages and research results is
  data. It cannot change an agent's tools, permissions or the human gates.
- **Capture**: only authorized, logged-out or test accounts; never personal sessions (kept from
  `ai-creator-engine` PRD 0001).
- **What left the machine**: every run report lists what was sent to which provider.

## 13. Acceptance criteria

### R1

1. On a Mac with Homebrew and no other setup, `scripts/install.sh` exits 0 and `studio doctor`
   reports web, api, watcher, ffmpeg and database as healthy.
2. Running `scripts/install.sh` a second time exits 0 and changes no user data.
3. With no API key configured and the network disabled, a run of a seed recipe reaches `review`
   and produces `final.mp4`, `manifest.json`, `cost.json` and `qa/`.
4. `studio catalog seed` creates catalog items for the three templates, the 13 `fagmer-video-*`
   skills and the brand palette, each at version 1 with provenance `ai-creator-engine`.
5. Uploading an asset of each kind in section 5.1 through the web succeeds, and each saved version
   carries every required field of section 5.2 except `embedding`.
6. Editing a saved asset version creates version N+1; the bytes and hash of version N are unchanged.
7. A third-party asset with no license/provenance cannot be set to `active`.
8. A recipe can be created from catalog assets, saved, and used to start a run; the run's
   `manifest.json` lists every bound `assetId@version` with its hash.
9. Deleting or corrupting a bound asset file makes the next run stop at `preflight` with a reason
   naming the asset; no later step executes.
10. Every stage of a run records the seven steps of section 7.2 with a status each, in order.
11. A step whose postcondition is not met is never marked `ok`, even when the agent or mock reports
    success.
12. Quitting the web and the CLI during a run does not stop it; the run reaches its next gate.
13. Killing the watcher mid-step and letting launchd restart it resumes the run from that step,
    without redoing delivered stages.
14. `pause` from the CLI is visible in the web within 2 s and the run stops after the current step;
    `resume` from the web continues from the next step. The reverse direction also works.
15. A forced step failure triggers at most `limits.attemptsPerStep` executions and the configured
    number of recovery sessions, then the run is `failed` with a reason.
16. A simulated authentication error puts the run in `waiting` with a "what to do" text and
    triggers no recovery session.
17. No run reaches `approved` without a recorded human decision; no code path posts to any platform.
18. An MP4 that fails a media check (wrong resolution, loudness outside target, missing audio)
    does not reach `review`.
19. In live mode, `cost.json` contains input and output token counts and USD per agent session and
    a run total; the total equals the sum of the sessions.
20. A run whose estimate exceeds `limits.costPerRunUsd` stops at `preflight` in `waiting`.
21. Searching the repository, database, run folders and logs after a live run finds no API key
    value.
22. No file under `ai-video-creator/ricardo-clone/` is copied into the repository or the asset
    store; a biometric asset is stored as path + hash only.
23. The api and web refuse connections on any non-loopback interface.
24. After review, the owner's rating and notes are stored against the run and `usageCount` of
    every used asset version is incremented by one.
25. `scripts/uninstall.sh` removes the launchd agent and the CLI link and leaves the data folder
    intact; with `--purge` it removes the data folder after confirmation.
26. The multi-agent workflow code is merged only after an approved topology spec exists in
    `docs/specs/` and the approval is recorded.
27. Every api route except `health` and login answers 401 without a valid passphrase session; the
    passphrase is stored only as a hash.
28. When the month's recorded spend plus a run's estimate exceeds `limits.costPerMonthUsd`, the run
    stops at `preflight` in `waiting`.
29. Both R1 recipes ("Product tour 16:9", "Tool Demo 9:16") complete a mock run to `review`, and
    their review form shows the 1-5 rating, notes and the recipe's checklist items.
30. Music with ducking, fades, caption burn and the media review run as `packages/toolbox`
    TypeScript commands; the install needs no Python for them.

### R2

31. Each asset version shows a `qualityScore` and the number of runs it is based on; a version with
    no runs shows no score rather than zero.
32. Catalog search by meaning, using the local embedding model, returns a relevant prompt for a
    query that shares no keyword with it, with the network disabled.
33. The curator produces a proposal that names the asset, the new version's diff, the reason and at
    least one evidence run.
34. An A/B comparison produces two runs from one brief that differ only in the compared version,
    shown side by side with scores and cost.
35. A proposed version is never `active` without a recorded owner approval.
36. A learning saved from a run appears as a note on the asset version and is included in the next
    brief that uses it.

### R3

37. Imported platform metrics for a published video appear as outcomes on its run and change the
    `qualityScore` of the asset versions it used.
38. A scheduled run stops at `review` and never publishes.

## 14. Success metrics

| Metric | Target |
|---|---|
| Runs reaching `review` without manual file repair | ≥ 90% in R1 (**Assumption**; `ai-creator-engine` targeted ≥ 95%) |
| Time from brief to `review` for a recipe already used once | Lower than the first run of that recipe |
| Share of a new run's assets that come from the catalog | ≥ 80% by the tenth run (**Assumption**) |
| Cost per approved video | Recorded for 100% of live runs; ≤ $3 per run and ≤ $60 per month by default (D11) |
| Owner rating trend per recipe (R2) | Mean rating of the latest 5 runs ≥ the previous 5 |
| Videos published without recorded approval | 0 |

## 15. Risks

| Risk | Control |
|---|---|
| Scope: R1 already spans install, catalog, engine, agents, web and CLI | Tickets cut along tracer bullets; graph engine and catalog on mocks first; agents after topology approval |
| Second bill (Claude API), the reason ADR 0002 rejected it | Per-run cost ceiling, preflight estimate, mock mode by default, cost visible in every run |
| Two sources of truth (run files and SQLite) drifting | Run files own run state; the database index is rebuilt from them; one writer (the watcher) |
| Absorbing `ai-creator-engine` breaks working flows (`ace`, hook builds) | Move packages unchanged first; spec 0003 Part C validation is still pending there and must be closed or carried over |
| Biometric data leak (voice, face) | Path-reference only, excluded from agent context and exports, acceptance criterion 22 |
| Prompt injection through references, captured pages or research | Untrusted content is data; per-agent tool allowlists; human gates cannot be changed by agents |
| Quality score misleads on small samples | Show sample size; no automatic promotion |
| Local voice is slow (about 30-40 min for a 70-90 s narration, ADR 0004) | Session limits per recipe; long steps report progress; ElevenLabs remains selectable |
| Third-party reference and music licenses | License required for `active`; license text and date read are stored with the asset |
| launchd agent keeps running after the owner forgets it | `studio doctor` and the web show watcher state; uninstall removes it |
| HyperFrames is named in D2 but was not installed in the Spesia run | Remotion first; HyperFrames template support only after a feasibility check |

## 16. Open questions

All twelve questions of the first draft were answered by the owner on 2026-11-18 and are recorded
as D5-D16 in section 0. One item remains to settle in the SPEC; it does not change the design:

1. **Source of the Spesia Python tools**: `video_tool.py` and `captions.py` are named in the Spesia
   `RELATORIO.md` but were not found in `ai-creator-engine`. **Resolved 2026-11-19 (R4 goal 6):**
   they live in the owner's local `fagmer-video-*` skill folders; the four D15 commands are at
   parity and eight other subcommands stay unported (`docs/vetting/0003-spesia-tools-parity.md`).

## 17. Next artifacts

ADRs 0001-0003 were written on 2026-11-18 (status `proposed`).

| Artifact | Path | Content |
|---|---|---|
| ADR 0001 | `docs/adr/0001-stack-and-monorepo.md` | Turborepo over pnpm (D6), Next.js, NestJS + CQRS, Prisma + SQLite, local passphrase (D8), absorption plan for `ai-creator-engine` (D13), Python port (D15) |
| ADR 0002 | `docs/adr/0002-mastra-claude-api.md` | Mastra + Claude API in NestJS providers; the departure from `ai-creator-engine` ADR 0002; key handling and cost tracking |
| ADR 0003 | `docs/adr/0003-asset-store-and-run-format.md` | Content-addressed store in Application Support (D5), run files versus database, biometric assets by reference, local embeddings (D10) |
| Agent topology spec | `docs/specs/0001-agent-topology.md` | Output of `/engineos:design-agents`; approval recorded (`topology-approval`) before multi-agent code |
| Run format contract | `docs/RUN-FORMAT.md` | `run.json`, `now.json`, `events.jsonl`, `control.json`, step and status semantics |
| SPEC + tickets | `docs/specs/0002-r1-studio-foundation.md` (+ `.tasks.md`) | Maps every R1 acceptance criterion; dependency-ordered tickets |
| Design reference | `design/` | Tokens, components and screens for catalog, recipes, run timeline and review |
