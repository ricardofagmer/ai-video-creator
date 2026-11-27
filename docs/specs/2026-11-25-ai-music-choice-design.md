# Background music: chosen song or AI decides by category — design

Date: 2026-11-25 · Owner: Ricardo Fagmer · Status: accepted (owner approved 2026-11-25: "Approve (Recommended)", "Keep all 17 (Recommended)", "No preview, build (Recommended)")

## Problem

Owner request (2026-11-25):

> "we can decide the background music song, or we can have a option to the ai decides with a
> category: animated, excited, sad, upset, boring, classic, electronic, thoughtful, guitar,
> acoustic guitar, piano, voices and so on"

What the code does today:

- A preset (recipe) binds exactly one catalog `music` version in the `music` slot. The `music`
  stage (`apps/watcher/src/stages/executors/music.executor.ts`) mixes that track under the video
  with the `music-bed` command. Without a binding the stage stops for a person (`musicNotBound`).
- A music version carries `durationMs`, `bpm` and `integratedLufs` only (`MusicDetailsSchema`).
  Nothing says what a track sounds like, so nothing can pick one by mood or instrument.
- No music is generated anywhere. ElevenLabs is already a provider (voices).

## Owner decisions (clickable questions, 2026-11-25)

- Track source in AI mode: "Catalog, then generate".
- Timing: "Per video, at run time (Recommended)".
- Category: "Several allowed".
- Screens: "Preset form and wizard (Recommended)".

## Chosen approach

### 1. Categories (shared vocabulary)

`MusicCategorySchema` in `packages/shared/src/catalog/`, a closed list:
`animated`, `excited`, `sad`, `upset`, `boring`, `classic`, `electronic`, `thoughtful`, `guitar`,
`acoustic-guitar`, `piano`, `voices`, plus (assumption, owner said "and so on") `calm`, `happy`,
`epic`, `cinematic`, `lo-fi`. Adding one later is a one-line change plus three labels.

`MusicDetailsSchema` gains `categories: MusicCategory[]` (0 to 8, no duplicates, default `[]` so
stored versions stay valid). The catalog music form gets a "Categories" multi-choice field; the
catalog list shows them as tags.

### 2. Music mode on the preset

The recipe gains `music`, a discriminated union:

- `{ mode: 'track' }` (default; today's behaviour, the `music` slot binding names the song).
- `{ mode: 'auto', categories: MusicCategory[] }` (0 to 8; empty means "any": the AI also picks
  the mood). In this mode the recipe carries no `music` slot binding.

Composition rule `stage-needs-binding` for the `music` stage is satisfied by either a `music`
binding or `mode: 'auto'`. A recipe with both is refused (`music-mode-conflict`).

### 3. Picking at run time (music stage)

In `auto` mode the `music` stage, which already runs after the script exists:

1. Lists active catalog `music` versions that are `file` layout, stored, not biometric.
2. Keeps those carrying all chosen categories; when none do, those carrying any of them.
3. One candidate: uses it. Several: one model call (script text, video length, candidates with
   name, categories, bpm, duration) answers one ref and a one-line reason. No call when
   categories are empty and the catalog has no music at all.
4. No candidate: generates a track (section 4).
5. Verifies the picked version's content hash before mixing, and records the pick (ref, hash,
   reason, `source: 'catalog' | 'generated'`) in the stage report, so a run shows which song it
   used and why. A rerun of the same run reuses the recorded pick.

Mixing is unchanged (`music-bed`, same loudness targets).

### 4. Generation fallback

ElevenLabs Music through the existing ElevenLabs connection: prompt built from the chosen
categories and the script's mood, instrumental unless `voices` is chosen, length equal to the
video's duration within the provider's limits (looped by `music-bed` when shorter). The file is a
run artifact (`music-track.mp3` in the run folder); it is not added to the catalog.

- The stage's `estimate()` reports the generation cost in `auto` mode; the run's spend limits
  apply as they do to narration.
- No ElevenLabs key, provider refusal or spend limit reached: the stage stops for a person with
  what to do (bind a song, add categories to tracks, or connect ElevenLabs). Never a silent
  video without music.
- The exact endpoint, model id and price are checked against ElevenLabs' current documentation
  at implementation; this spec does not fix them.

### 5. Screens

Preset form (`RecipeBindingsSection`) and wizard (`WizardStyleStep`): the Music row gets a
two-option choice built with the existing `RadioGroup`: "Choose the song" (today's select with
"Listen") and "AI decides" (category multi-choice, hint that empty means any). Wizard draft
stores the mode and categories. Labels in pt-BR, es and en.

## Implementation amendments (2026-11-25)

- Section 2: the mode lives in the `music` stage's `params` (`musicMode`, `musicCategories`,
  read with `musicChoiceOf`), like `siteAnalysis` on `research`, not in a new recipe field. Stage
  params are already part of the hashed definition, so presets saved before keep their content
  hash and no stored row changes.
- Section 3 step 3: the pick among several candidates is made by the Scene director (owner
  decision 2026-11-25: "Scene director picks (Recommended)"), not by a separate model call. The
  director packet carries `inputs.music` (categories and candidates) and `ScenesOutput` gains the
  optional `musicPick`. The music stage re-checks the pick against the candidates and falls back
  to a rule (most categories matched, then length closest to the video) when it is absent or not
  a candidate, or when the `scenes` stage is off.

- Section 4: the generation path is written but fails closed. The cost ledger has no music spend
  kind, so a live generation cannot be priced or recorded and the stage stops for a person
  (owner decision 2026-11-25: "Ship catalog pick now (Recommended)"). Acceptance 5 moves to a
  follow-up change that adds the cost kind; acceptance 6 covers the case until then.

## Rejected alternatives

- Free-text mood instead of a closed list: cannot be matched against catalog tags reliably.
- AI suggests once in the form and saves a fixed binding: owner chose per-video.
- Adding generated tracks to the catalog: the watcher does not write the catalog (ADR 0003);
  left for a later change.

## Out of scope

Sound effects, music per scene, editing a generated track, saving generated tracks to the
catalog, the CLI, changes to `music-bed`.

## Acceptance

1. A music asset can be saved with categories; they show in the catalog.
2. Preset form and wizard offer "Choose the song" / "AI decides" with categories; saving and
   reopening keeps the choice.
3. Auto mode with a matching catalog track: the run's video carries that track and the music
   step names the song and the reason.
4. Auto mode with several matches: one model call picks; the pick is recorded and reused on rerun.
5. Auto mode with no match and ElevenLabs connected: a track is generated, mixed, and its cost
   appears in the run's spend.
6. Auto mode with no match and no ElevenLabs: the step waits for a person with clear next steps.
7. A preset with both a bound song and `auto` is refused on save.
8. Presets saved before this change behave exactly as before.

## Tickets (dependency order)

- T1 shared: categories, `MusicDetails.categories`, recipe `music` mode, composition rule. Freezes the contract.
- T2 core + api (after T1): persist and serve categories and mode; list music candidates query.
- T3 watcher (after T1, T2): pick, record, generate fallback, estimate, owner texts.
- T4 web (after T1, T2): catalog categories field, preset form and wizard mode control, messages.
