# Site capture question and "no video without pictures" rule

Date: 2026-11-25. Owner: Ricardo Fagmer. Status: approved by the owner on 2026-11-25 ("Approve (Recommended)", "Refuse everywhere (Recommended)", login wall "Not now (Recommended)", "No preview, build (Recommended)").

## Problem

A run can finish with only text cards on screen. Run `01M89HKZJZ23NVBQ1HB8TBAW44` had no site address, no image and no clip: its three scenes are title cards. The owner's rule (2026-11-25): "when working with sites, we should ask to the user, should i use screenshot of the site to create a video? then use it otherwise do not allow videos without images or even another video".

## Owner decisions (2026-11-25)

- Rule home: "Both (Recommended)": the app enforces it and the assistant follows it.
- Where to ask: "Before the run starts (Recommended)".
- Capture type: "Keep screen recording (Recommended)": the existing 5 to 20 s page recording is the site picture.
- Capture fails: "Stop and ask me (Recommended)".

## Design

### 1. The owner's answer is part of the brief

`Brief.siteCapture?: 'use' | 'skip'` in `packages/shared/src/recipes/brief.ts`. Optional in the schema, so run files written before this change still parse. A run created from now on must carry it when `sourceUrl` is set.

### 2. One pure rule, used by the web and by the server

`packages/shared/src/recipes/visual-media.ts`:

```ts
export type VisualMediaProblem = 'site-capture-unanswered' | 'site-capture-disabled' | 'no-visual-media';
export function visualMediaProblem(facts: { brief; recipe; pictureCount: number }): VisualMediaProblem | null;
```

- `site-capture-unanswered`: `sourceUrl` is set and `siteCapture` is not.
- `site-capture-disabled`: the answer is `use` and the preset has no `capture` stage. A `capture` stage that is only switched off is switched on for this run by `recipeForBrief`, the way a site address already switches on `research` and `verify`.
- `no-visual-media`: no site capture will happen (no `sourceUrl`, or the answer is `skip`) and `pictureCount` is 0.

`pictureCount` counts the run's references and the preset's bound assets that are pictures: kind `image`, or kind `reference` with sub-kind `image`, `video` or `screenshot-set`. Biometric items do not count, because the director never receives them.

### 3. Server refuses the run (authoritative)

`RunDraftService.create` (`packages/core/src/runs/run-draft.service.ts`) runs the rule after the references are verified and throws one of `SiteCaptureUnansweredError`, `SiteCaptureDisabledError`, `RunWithoutPicturesError` (category `validation`; api reasons `site-capture-unanswered`, `site-capture-disabled`, `run-without-pictures`). One place, so the new video form, the wizard, cart checkout, comparisons and scheduled runs all meet it. A scheduled brief with no picture fails when its slot creates the run, with this error.

### 4. Capture stage follows the answer

`CaptureExecutor` (`apps/watcher/src/stages/executors/capture.executor.ts`): `siteCapture: 'skip'` behaves as "no source" (no page recording, no capture output declared). `use` records as today. A run file with `sourceUrl` and no answer (older runs) records as today.

When the page still cannot be recorded on the second attempt, the stage stops for a person (`needs-person`) with a text that says to add an image or a clip, or to cancel. The run does not go on to a video without pictures.

### 5. Web asks the question

`RunBriefFields` (shared by the new video form, the wizard "Ideia" step and "Nova comparação") shows a required Yes/No choice "Use screenshots of the site in the video?" under the site address, only while the address is filled. `buildBrief` returns an inline error when it is unanswered. The wizard review step shows the answer. The forms show the server's refusal sentence (`run-without-pictures` and the two site reasons) when the run is refused. The forms do not check for pictures before sending: they hold reference ids, not their kinds, so the server is the one check. Texts in pt-BR, es and en.

## Rejected alternative

Ask during the run (planner question at the plan step). Rejected by the owner's choice: the run would start, cost a plan call and wait in the run page; today an unanswered planner question lets the run go on.

## Not in this change

- Detecting a login wall. The recorder films whatever page loads: run `01M89HC2MR935K1YRESX9KVQBN` filmed LinkedIn's login wall and used it. The stop in section 4 covers a page that cannot be recorded, not a page that records the wrong thing.
- Still screenshots instead of the recording.
- A schedule form change. Scheduled briefs reuse the brief schema; one with no picture is refused at slot time.
- Runs already in `review` are not changed.

## Done when

- A site address without the answer cannot start a run (form error; server refusal).
- Answer Yes: the run records the page and the scenes can use it. Answer No with no image or clip: the run is refused with the `no-visual-media` sentence.
- No site address and no image or clip: the run is refused.
- One image or clip on the run, no site: the run starts as today.

## Risks

- Medium risk. Existing tests and fixtures that create runs with no picture will fail until they carry one; no test has run on this branch (owner: "Skip for now").
- Presets whose flow never shows a picture (text-only by design) can no longer run. None is known.
