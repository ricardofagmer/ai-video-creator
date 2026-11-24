# Guided creation: voice samples, composition rules, video reference analysis, wizard — design

Date: 2026-11-23 · Owner: Ricardo Fagmer · Status: accepted (owner approved 2026-11-23: "Approve (Recommended)", "No preview, build (Recommended)")

## Problem

The owner asked for four things (2026-11-23):

> "the voices should be playable to the user listen to decide which one use
> also create some rules, to not allow thing that will conflict the video creation like many voices and etc
> also when save video reference start ai to analise the content to create a prompt references to apply in the creations
> also create a wizard pipeline to start from step 0 till the outcome"

What the code does today:

- **Voices.** A voice is a catalog `ai-model` item: the owner's clone (`voice-clone`, biometric,
  spoken by the local voice script) or an ElevenLabs voice (`provider-model`). No audio of a voice
  exists anywhere, so the owner picks by name. Biometric rows reach the browser by name and ref only.
- **Conflicts.** A recipe already refuses two bindings in one slot. But the cart silently lets the
  last voice (template, brand kit, music) win (`fillSlotsFromCart`), and a step that lacks what it
  needs fails in the middle of a run (`voiceNotBound`, `musicNotBound`). Nothing compares the
  recipe's format with the template's, or the run's duration with the template's range.
- **Video references.** A reference carries only the owner's `referenceNotes`. No model looks at
  the video. Instagram references are links only (nothing is downloaded, earlier decision).
- **Creation path.** Cart, new recipe (one long form) and new run are three separate screens.

## Owner decisions (clickable questions, 2026-11-23)

- Voice sample: "Generate once, all voices (Recommended)". The clone is included; only the
  generated sample reaches the browser, never the original recording.
- Rules to block: all four offered. One of each (voice, template, brand kit, music); a step on
  without what it needs; template and format mismatch; duration outside the template range.
- Video analysis output: "Style notes on the reference (Recommended)", sent to the writer and
  director whenever that reference is used in a run. No draft Prompt is created.
- Link-only videos: "Analyse video files only (Recommended)". A link-only reference shows a note
  and a way to attach the file later.
- Wizard: "New guided flow beside them (Recommended)". The current screens stay.

## Chosen approach

### 1. Asset jobs: one small queue for work on a catalog item

Voice samples and video analyses are both "work on one catalog version, outside any run". Model
calls and voice engines live in the watcher, so both run there.

- A job is a folder: `<data home>/asset-jobs/<jobKind>/<assetId>@<version>/job.json`, plus its
  result files. `jobKind` is `voice-sample` or `reference-analysis`. Folder names come from the
  validated `AssetRef`, never from request text.
- States: `requested → running → done | failed | refused`. The api writes `requested` once; the
  watcher owns every later write (single writer per state, the curation rule).
- The watcher gets one `asset-jobs` step shaped like the curation step: scan, claim the oldest
  `requested` job, run it, write the ending. One job at a time; at most 10 `requested` per kind;
  a `running` job whose claimant is gone is ended `failed` in the start sweep.
- Cost: a live job is priced with the price table and recorded in the month spend before its
  result is written. A job is `refused` when the month ceiling would be passed, or when the spend
  cannot be read (fails closed). `cost_entries.source_kind` has a CHECK of `run | curation`, so
  this needs **one authored migration** adding `asset-job` (`runId` holds the job's ref,
  `stepKey` holds `asset-job:<jobKind>`).
- `failed` and `refused` jobs can be requested again; `done` is kept until the owner asks again.

### 2. Voice samples

- **When.** On the first press of play for a voice version (not at save time), so a voice nobody
  listens to costs nothing. Later presses play the kept clip.
- **What is spoken.** One fixed sentence per recipe language, the same for every voice, so voices
  compare fairly. pt: "Olá! Esta é uma amostra desta voz para você decidir se ela combina com o
  seu vídeo." en: "Hi! This is a sample of this voice so you can decide if it fits your video."
  The text is a constant in `@studio/shared`; no request can change it.
- **Engines.** The job reuses the narration code paths: ElevenLabs (`speakWithElevenLabs`, egress
  recorded as `tts-text`), the local voice script for the clone (`speakWithLocalVoice`, the
  reference path only in the script's job file, as C11 already requires), or the mock voice when
  the provider is not live. `job.json` records the engine. A mock clip is labelled "Simulado" in
  the player and is replaced the first time play is pressed with the provider live.
- **Files.** `sample.mp3` (ElevenLabs) or `sample.wav` (local, mock) in the job folder, mode 0600.
- **Api** (session guard on all; `Origin` allowlist on the POST):
  - `POST /catalog/:assetId/versions/:version/voice-sample` → 202 with the job view. Idempotent:
    an open or done job is returned as it is. 404 unknown version; 422 `not-a-voice`.
  - `GET  /catalog/:assetId/versions/:version/voice-sample` → the job view.
  - `GET  /catalog/:assetId/versions/:version/voice-sample/audio` → the clip, `Cache-Control:
    no-store`, `Content-Type` from the recorded engine, `X-Content-Type-Options: nosniff`.
- **Web.** One `VoiceSampleButton` (the app's existing button style): play, a "Gerando amostra…"
  state that polls the job, pause, and an error line with "Tentar de novo". It appears on voice
  cards in the catalog, in the recipe editor's voice slot, at cart checkout and in the wizard.
- **The clone.** The generated sample is derived biometric data. It stays in the data home, is
  served only to the signed-in session, is never embedded, logged, hashed into a run or sent to a
  provider, and is deleted when the voice version is deprecated or a new sample is requested.
  This relaxes "biometric rows reach the browser by name and ref only" for this one file, by the
  owner's decision above.

### 3. Composition rules

One pure module, `packages/shared/src/recipes/composition-rules.ts`, used by the web screens and
by core, so the browser and the server always agree.

```ts
export type CompositionConflict =
  | { rule: 'duplicate-kind'; kind: 'ai-model' | 'template' | 'brand-kit' | 'music'; refs: AssetRef[] }
  | { rule: 'stage-needs-binding'; stageId: 'narration' | 'music' | 'composition'; slot: 'voice' | 'music' | 'template' }
  | { rule: 'template-format-mismatch'; field: 'aspect' | 'canvas' | 'fps'; recipe: string; template: string }
  | { rule: 'duration-outside-template'; targetSec: number; minSec: number; maxSec: number };

export function cartConflicts(items: readonly { kind: AssetKind; ref: AssetRef; status: AssetStatus }[]): CompositionConflict[];
export function recipeConflicts(recipe: RecipeCompositionFacts, template: TemplateDetails | null): CompositionConflict[];
export function runConflicts(recipe: RecipeCompositionFacts, template: TemplateDetails | null, targetDurationSec: number): CompositionConflict[];
```

| Rule | Checked where | What the owner sees |
|---|---|---|
| `duplicate-kind` | cart checkout; wizard | "Há 2 vozes no carrinho. Escolha uma." Finalizar is disabled until one is removed. `fillSlotsFromCart` stops replacing silently. |
| `stage-needs-binding` | recipe save (web and core); run start (web and core) | "A narração está ligada, mas a receita não tem voz." |
| `template-format-mismatch` | recipe save (web and core) | "A receita é 9:16 e o modelo é 16:9." |
| `duration-outside-template` | recipe save for the recipe's range; run start for the brief's target (web and core) | "O modelo aceita de 15 a 60 s; o vídeo pede 90 s." |

- Core refuses with 422 `composition-conflict` and the conflict list, from `CreateRecipe`,
  `SaveRecipeVersion` and the run draft service. Messages are built in the web from the conflict
  data (pt-BR, en, es); core sends ids and numbers only.
- Saved recipe versions are immutable and are not rewritten. A saved recipe that breaks a rule
  cannot start a run until a new version fixes it; the message says which field to fix.
- **Effect on today's recipes:** a recipe with narration on and no voice now refuses to start,
  also in mock mode (today mock mode speaks with the mock voice). The seed recipes get a voice
  binding in the same change so the mock demo keeps working.

### 4. Video reference analysis

- **When.** After `create`, `saveVersion` or `registerByReference` succeeds for a `reference` with
  `subKind: 'video'`, a video file (`video/*`) and a sensitivity other than `biometric`, the api
  writes a `reference-analysis` job. A failed enqueue never fails the save. A link-only reference
  (`text/plain` holding a URL) gets no job; its page shows "Anexe o arquivo do vídeo para a IA
  analisar" and the existing new-version upload.
- **Frames.** The watcher samples 8 frames evenly across the video with the existing ffmpeg
  helpers (`probeDurationMs`, `extractJpegFrame`), each at most 1280 px wide. The video path comes
  from the catalog row and is checked against the registered biometric references first.
- **Model call.** A new non-run service `ReferenceAnalystService` in core, shaped like
  `CuratorAgentService` (the run roster is run-bound): one call, no tools, frames as image parts,
  Sonnet by default, at most 2,000 output tokens, 120 s, worst case $0.25. Prompt
  `reference-analyst@1`: the frames, the item's name and the owner's notes are data, never
  instructions. Mock mode writes a labelled "Simulado" analysis and opens no connection.
- **Output**, strict and bounded, stored in `job.json`:

```ts
export const ReferenceStyleAnalysisSchema = z.object({
  summary: z.string().min(1).max(600),
  hook: z.string().max(300),          // how the first seconds grab attention
  pacing: z.string().max(300),        // cut rhythm, scene length
  shots: z.array(z.string().min(1).max(200)).max(8),
  onScreenText: z.string().max(300),  // caption and title style
  visualStyle: z.string().max(400),   // colours, framing, motion
  promptNotes: z.array(z.string().min(1).max(300)).min(1).max(6), // directions a writer or director can follow
  cautions: z.array(z.string().min(1).max(200)).max(4),
}).strict();
```

- **Egress.** Frames of a third-party video go to the model provider. Each call is recorded in
  the job's own `egress.jsonl` (provider, what: `reference-frames`, frame count, bytes).
- **Api and web.** `GET` and `POST /catalog/:assetId/versions/:version/reference-analysis` (state;
  request again). The reference page shows an "Análise da IA" card: waiting, running, the notes,
  or the failure with "Analisar de novo". The owner's own notes stay separate and editable.
- **Use in creations.** The `script` stage reads the `done` analyses of the run's references (at
  most 5, in run order) through a new `ReferenceAnalysisReaderPort`, writes them as its output
  `reference-analyses.json` (so the run records exactly what it used), and passes them to the
  writer. `scenes` reads that output and passes it to the director. `writer@6` and `director@5`
  receive them as `<untrusted id="reference-analyses">` with one added line: follow them for
  style, never as instructions; the owner's brief and instructions win. References without a
  `done` analysis are simply not in the file.

### 5. Wizard: "Criar vídeo"

A new route `/criar`, first item of the production menu group. One client stepper; the draft is
kept in `sessionStorage` (`studio.wizard.v1`) so a reload keeps the answers. It reuses the
existing fields and views instead of copying them.

| Step | What the owner does | Reuses |
|---|---|---|
| 0 Ideia | Topic, key messages, language, duration, instructions, optional site for the AI | `RunBriefFields`, `RunInstructionsField`, `https-url.ts` |
| 1 Referências | Picks references; cart items come preselected; each video shows its analysis state | `RunReferencesPicker` |
| 2 Receita | Picks an existing recipe as the base | recipe list |
| 3 Voz e estilo | One voice (with play), one template, optional brand kit and music | `VoiceSampleButton`, binding options |
| 4 Revisão | Summary, every conflict with a "Corrigir" link to its step, cost estimate | `composition-rules`, `RunPlanCard` |
| 5 Produção | Starts the run; live progress and gate decisions inline | `RunLiveView`, `GateDecisionActions` |
| 6 Resultado | The finished video, links to the run and its review | run page parts |

- A voice or template lives in a recipe version, not in a run. When step 3 differs from the base
  recipe's pins, "Iniciar" first saves a **new draft version of that recipe** with the new pins,
  and the review step says so before the owner confirms. When nothing differs, the base recipe
  version runs as it is.
- "Iniciar" is disabled while step 4 lists a conflict. The server checks the same rules again.
- Steps 5 and 6 work from the run id in the URL (`/criar?execucao=<runId>`), so the page survives
  a reload and the run also appears in Execuções as any other run.

## Rejected alternatives

- *Samples generated when the voice is saved.* Pays for voices nobody listens to, and the save
  would wait on a provider.
- *The provider's own preview clip for ElevenLabs.* Different text per voice, nothing for the
  clone, and a second provider call path to secure. The owner chose generated samples.
- *A database table for job state.* Needs a second migration and two writers on one row; the
  curation step already proves the file queue with a single writer per state.
- *Analysis written into `referenceNotes`.* It would mix the AI's text with the owner's, and a
  new catalog version would be needed for every analysis.
- *Analysis as a new run stage.* A stage runs per video made; the analysis belongs to the
  reference and is paid once.
- *Rules only in the browser.* The api and schedules can create recipes and runs too.
- *A wizard that replaces the forms.* The owner chose to keep them for advanced use.
- *Run-level voice or template overrides in the wizard.* It would change the run format and the
  manifest; saving a recipe version uses what exists.

## Frozen contracts (T1 writes these first; later tickets do not redefine them)

- `packages/shared/src/asset-jobs/`: `AssetJobKindSchema`, `AssetJobStatusSchema`,
  `AssetJobFileSchema` (ref, kind, status, requestedAt, claim, engine, error code, `analysis`),
  folder and file helpers, the queue bound (10), `VOICE_SAMPLE_TEXT` per language.
- `packages/shared/src/agents/reference-analysis.ts`: `ReferenceStyleAnalysisSchema`, the
  `reference-analyses` artifact schema (max 5 entries), the `reference-analyst@1` version id.
- `packages/shared/src/recipes/composition-rules.ts`: the types and three functions above.
- `packages/shared/src/api/`: `VoiceSampleView`, `ReferenceAnalysisView`, the four route segments,
  the 422 `composition-conflict` error body.
- `packages/shared/src/ports/`: `ReferenceAnalysisReaderPort`, `AssetJobCostPort`.
- Writer and director packet fields `referenceAnalyses?`; prompt versions `writer@6`, `director@5`.

### Amendment 1 (as built in T1, 2026-11-23)

The files in `packages/shared` are the contract; where this text and they differ, they win.

- Paths are under `/catalog/assets/:assetId/versions/:version/` (`voice-sample`,
  `voice-sample/audio`, `reference-analysis`), like every other catalog route.
- `duration-outside-template` carries `subject` (`recipe-range` or `run-target`) and both ranges.
  A recipe's range conflicts only when it never meets the template's range; a run's target
  conflicts when it is outside the template's range.
- `cartConflicts` counts active versions only, because only those can be pinned.
- Languages are `pt-BR` and `en-US` (`LanguageSchema`); `VOICE_SAMPLE_TEXT` is keyed by them.
- Job files: `asset-jobs/asset-job.ts` (`AssetJobFileSchema`, error codes, egress line). File
  helpers: `@studio/shared/asset-jobs/files`. The api's request write replaces a terminal job and
  refuses an open one (`AssetJobOpenError`).
- Ports add `ReferenceAnalystPort` beside `ReferenceAnalysisReaderPort` and `AssetJobCostPort`.
- Error reasons: `apiGuidedCreationErrorReasons`; `ApiError.details.conflicts` carries the
  conflict list. `API_CONTRACT_REVISION` stays 7 (all additive, as the site analysis did).

### Amendment 2 (as built in T2 agents, 2026-11-23)

- The writer prompt is `writer@7`, not `writer@6`: `writer@6` was taken the same day by the
  word-budget change (`.engineos/changes/2026-11-23-claude-code-engine.md`). Every `writer@6` in
  this spec reads `writer@7`. `director@5` is as written.
- `ReferenceAnalystPort.analyse` may also reject with `ReferenceAnalystCallError` (kinds
  `cancelled`, `invalid-request`, `redaction-failed`, `model-unpriced`). On `cancelled` its
  context can carry a billed or worst-case spend, which the watcher records like any billed call.
  A `failed` result can carry a worst-case estimated `usage`/`usd` when a request left and no
  usage came back; it is recorded the same way, so the month spend never undercounts.
- Under the Claude Code engine (ADR 0011) there is no API key for image parts: a live analysis
  ends `credential-refused` and the reference page says so. The mock stand-in is unaffected.

### Amendment 3 (found in T2 backend, decided by the supervisor as contract owner, 2026-11-24)

- The watcher never writes SQLite (ADR 0003; its connection is read-only), so asset-job costs
  follow the curation path instead of a direct row write: `AssetJobCostPort.record` writes
  `cost.json` in the job folder (`assetJobFileNames.cost`), the month spend counts sessions not
  indexed yet, and the api indexes the file into `cost_entries` (`source_kind = 'asset-job'`) with
  `IndexAssetJobCostCommand`. The port signature is unchanged.
- Scheduled runs respect the composition rules too: the schedule gate refuses a recipe or brief
  that breaks one, and the watcher checks again when it creates the occurrence.
- A `done` reference analysis is returned unchanged when asked again (no second bill); only
  `failed` and `refused` are replaced. A `done` voice sample whose clip is gone is replaceable.
  A `done` voice sample in another language is returned as it is: the owner is choosing a voice,
  not a sentence, and switching language must not bill a new sample each time.
- Cart rule: an `ai-model` competes for the voice slot only when it is a voice
  (`CartCompositionItem.voice`); a voice plus an avatar model is not a conflict.

## Acceptance criteria

- AC1. Pressing play on a voice with no sample creates one job, shows "Gerando amostra…", then
  plays the clip. A second press plays the kept clip and creates no job.
- AC2. The sample text is the shared constant; no request field reaches the voice engine.
- AC3. The clone's sample is served only with a valid session, with `no-store`; the original
  recording's path appears in no log, event, view or response.
- AC4. A live ElevenLabs sample and a live analysis each add a `cost_entries` row with
  `source_kind = 'asset-job'`, and both are refused at the month ceiling with nothing spent.
- AC5. Two voices (or templates, brand kits, music tracks) in the cart disable Finalizar and name
  the kind; nothing is replaced silently.
- AC6. Saving a recipe with narration on and no voice, music on and no track, a format that does
  not match the template, or a duration range outside the template's is refused in the editor
  and by core with 422 `composition-conflict`.
- AC7. Starting a run whose target duration is outside the template's range, or whose recipe
  lacks a needed binding, is refused in the form and by core.
- AC8. Saving a video reference with a video file creates one analysis job; a link-only or
  biometric reference creates none and the page says why.
- AC9. A `done` analysis shows on the reference page; a failed one shows the reason and
  "Analisar de novo".
- AC10. A run with an analysed reference records `reference-analyses.json` in `script`, and the
  writer and director packets carry it inside the untrusted delimiter. A run with none has no
  such file and behaves as today.
- AC11. In mock mode nothing opens a connection: the sample is the mock voice and the analysis is
  the labelled stand-in, both at $0.
- AC12. `/criar` takes the owner from the idea to a started run without leaving the page, blocks
  "Iniciar" while a conflict is listed, shows live progress, and ends on the finished video.
  A reload at any step keeps the state.
- AC13. All new text exists in pt-BR, en and es.

## Tickets

| Id | Work | Scope (exclusive) | Needs | Owner |
|---|---|---|---|---|
| T1 | Frozen contracts above | `packages/shared/src/{asset-jobs,agents,recipes,api,ports}` | none | supervisor |
| T2 | Core: asset-job request commands and queries, `ReferenceAnalystService` with prompt and mock, `AssetJobCostPort` and the authored `asset-job` migration, rule checks in recipe and run commands, `writer@6`, `director@5`, seed voice binding | `packages/core` | T1 | llm and backend |
| T3 | Api: the four routes, the audio stream, enqueue after a video reference save, views | `apps/api` | T2 | backend |
| T4 | Watcher: the `asset-jobs` step with the two handlers, reference analyses in `script` and `scenes` | `apps/watcher` | T2 | backend and llm |
| T5 | Web: `VoiceSampleButton` and its placements, the analysis card, conflict messages at checkout, recipe editor and new run, messages in three languages | `apps/web` except `features/wizard` and `app/(studio)/criar` | T1 for rules, T3 for the rest | frontend |
| T6 | Web: the wizard | `apps/web/src/features/wizard`, `app/(studio)/criar`, one menu line | T5 | frontend |
| T7 | Final proof: tests for AC1 to AC13, typecheck, lint, security review, critic pass | tests | all, and the owner's approval at the final gate | test-writer, reviewers |

T3 and T4 run in parallel after T2. T5's rule screens can start right after T1.

## Risk and gates

- Risk **high**: the clone's sample is biometric-derived data reaching the browser, third-party
  video frames go to a model provider, and a database migration is involved.
- Required at the final gate, with the owner's consent then: `security-reviewer` (the audio
  route, the job folder confinement, frames and notes as untrusted model input, the new egress)
  and a `critic` pass.
- The migration is authored and reviewed; applying it to the owner's database needs the owner's
  explicit confirmation of the exact command first (`rules/security.md`).
- Rollback: the feature adds files and one CHECK value. Removing the routes and the watcher step
  disables it; `asset-jobs/` can be deleted; the migration's down path restores the old CHECK
  once no `asset-job` rows remain.

## Out of scope

- Speech transcription of videos, analysis of link-only (Instagram) references, a draft Prompt
  per video. (Superseded on 2026-11-24 for link-only references: Instagram, YouTube and TikTok
  links are now analysed, see `docs/specs/2026-11-24-link-reference-analysis-design.md`.)
- Choosing a custom sample sentence, or samples per recipe language beyond pt and en.
- The pending final checks of the two earlier features, and the emptied-site-field fix.
- Repackaging the desktop app.
