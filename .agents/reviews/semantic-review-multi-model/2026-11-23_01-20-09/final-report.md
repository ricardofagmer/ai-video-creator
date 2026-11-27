# Final consolidated issues report — System-wide pt-BR, Spanish and English localization across web, UI kit, Electron shell and CLI (Uncommitted working-tree i18n changes (pt-BR/es/en) in video-studio, as listed in /Users/ricardofagmer/projects/ai-video-creator/.agents/tasks/i18n-entire-system/report-web.md and report-cli.md (requirements: brief.md, same folder). Git may be blocked, so use the reports' file lists. Do not run next build or touch the dev server on port 4310.)

Issues are sorted from highest to lowest combined importance/confidence.

---

## 1. Live run page keeps the previous language after switching the flag

**Severity: High** · *(cluster: stale translated client state — see also #12, #16)*

- **User impact:** The owner switches the header flag to English or Spanish while a run is streaming and the event log keeps every row it already showed in the old language; only rows that arrive after the switch are translated. The "Now" panel keeps showing "Building the run plan" (or its pt-BR equivalent) until the run changes position. This is exactly the symptom the user reported — the flag says `en` while the page labels do not.
- **Issue:** `useRunLive` (`apps/web/src/features/runs/hooks/useRunLive.ts:95-128`) formats each `RunEvent` into an `EventLogItem` with the catalogue active at fetch time, stores the resulting strings, and keeps `cursorRef` at the end of the stream. When `locale` changes, polling restarts from that cursor and old rows survive through `appendEvents(previous.events, read.items)`; a `router.refresh()` does not discard client state. `RunNowCard` (`apps/web/src/features/runs/components/RunNowCard.tsx:31-49`) has the same defect by a different route: `positionKey()` is built from status, stage, step and attempt but not locale, so `useStepMessage()` returns the previously held translated string while the key is unchanged.
- **Recommendation:** Store raw `RunEvent` values in state and derive display rows from the current catalogue at render time; alternatively reset both `cursorRef` and the row list when `locale` changes so the stream is re-read and re-formatted. Add `locale` to the `positionKey()` identity, or localize the held activity after selecting it rather than before. Cover it with a test that changes locale without changing run position.

## 2. Publish review checklist renders in Portuguese for Spanish and English owners

**Severity: High** · *(cluster: recipe-pinned product text — see also #5)*

- **User impact:** On `/execucoes/[runId]/revisao` the eight compliance checkboxes (claims verified, media licences documented, no personal or confidential data) appear in Portuguese for every existing recipe, including both seeds, no matter which language is selected. These are the items the owner legally attests to before publishing, so the one screen where comprehension matters most is untranslated.
- **Issue:** `recipe-defaults.ts` now derives the checklist from `defaultChecklistOf(texts)`, so labels are pinned into the recipe definition in the creator's language and written into `run.json`. `ReviewForm` renders `item.label` verbatim from `run.recipe.definition.checklist`, with no catalogue lookup. Seeded recipes such as `seeds/recipes/product-tour-16x9.recipe.json` carry Portuguese labels under ids (`claimsVerified`, `toolFactsCurrent`, …) that already exist in the new message catalogue.
- **Recommendation:** Resolve the label by id on the read side — `texts.checklist[item.id] ?? item.label` — so known ids follow the active language and unknown ids still render the stored text. Keep the stored label under pt-BR and prefer the catalogue only for es/en, since the seeded pt-BR wording differs from the catalogue wording and pt-BR is meant to stay byte-identical.

## 3. Commander help and error chrome stays English in every locale

**Severity: High**

- **User impact:** `studio --help` and every CLI usage error mix languages: translated command and option descriptions sit under English `Usage:`, `Options:`, `Commands:`, `display help for command` and `error: unknown option …`. Under pt-BR, the product's source language, the most frequently seen CLI screen is partly English, which contradicts the "translate the entire system" requirement.
- **Issue:** `buildProgram()` (`tools/cli/src/program/program.ts:195-205`) localizes descriptions but only overrides Commander's output writers; the generated help titles, the built-in help option description and the output-error formatter are left at Commander's English defaults.
- **Recommendation:** Configure Commander from the active catalogue — help section titles, the help option description and `showHelpAfterError`/output-error text — while leaving command names, option flags and exit codes untouched. Add pt-BR and Spanish assertions for root help, subcommand help, unknown option, missing argument and unknown command.

## 4. Shared UI date/time formatter breaks the documented 24-hour, 4-digit-year format

**Severity: Medium**

- **User impact:** Two date formats coexist in one app. In English, the session-expiry line in the studio chrome and every catalog date render as `11/18/26, 4:02 PM` while run screens render `11/18/2026 14:02`; in Spanish the catalog shows 2-digit years. On `/catalogo` an asset card date sits next to run dates in the other format, and both design reports claim the clock is 24-hour in all locales.
- **Issue:** `formatDate`/`formatDateTime` in `packages/ui/src/utils/format.ts:55-57` use `{ dateStyle: 'short', timeStyle: 'short' }` with no `hourCycle: 'h23'` and no explicit year width, unlike `apps/web/src/lib/i18n/format.ts` and `run-labels.ts`, which pin `day: '2-digit'`, `month: '2-digit'`, `year: 'numeric'`, `hourCycle: 'h23'`. The divergent helpers are consumed by `apps/web/src/app/(studio)/layout.tsx:51` for session expiry and by `catalog-labels.ts` for `CatalogAssetItem` and `AssetVersionDetails`.
- **Recommendation:** Give the kit helpers the same explicit options as the web formatters (including `hourCycle: 'h23'` and `year: 'numeric'`), then assert the rendered output for one fixed instant in all three locales so the format contract is enforced rather than documented.

## 5. Script-approval gate label stays Portuguese inside rebuilt es/en notices

**Severity: Medium** · *(cluster: recipe-pinned product text — see also #2)*

- **User impact:** A Spanish or English owner waiting on script approval reads a translated sentence with a Portuguese object: "Waiting for the gate *Aprovação do roteiro*". The surrounding text changes language, the thing being waited on does not.
- **Issue:** `RunWaitingNotice` builds the es/en sentence from the catalogue but interpolates the gate label stored in the recipe definition, which is Portuguese for all pre-existing recipes. The gate id is already exported as `SCRIPT_APPROVAL_GATE_ID` and the translated label already exists as `t.recipes.defaults.scriptGate.label`.
- **Recommendation:** Map the known gate id to the catalogue label before interpolation, falling back to the stored label for unknown gates, mirroring the checklist fix in #2.

## 6. Rebuilt es/en watcher lines expose raw enum codes

**Severity: Medium**

- **User impact:** Where the pt-BR event log reads as a sentence, the Spanish and English rebuild drops to identifiers: recovery actions print as `retry-same-model`, agent roles and provider keys print as internal slugs, and gate waiting prints the gate slug. Non-Portuguese owners get machine strings in the middle of otherwise fluent prose.
- **Issue:** `run-events.ts` and `RunWaitingNotice.tsx` rebuild lines from structured fields, but no catalogue exists for agent roles, recovery kinds, providers or gate ids — `stepRecovery(action, …)`, `sessionStarted(role, model)`, `authenticationReason(provider)` and `gateWaiting(event.gate)` all interpolate the enum value unmapped. Stages, steps, checks, statuses and outcomes did get catalogues.
- **Recommendation:** Add `satisfies Record<Enum, string>` catalogue entries for roles, recovery kinds, providers and the known gate ids in all three locales, so a new enum member fails `typecheck` instead of leaking a code into the UI.

## 7. Translated CLI error leads end with English validation details

**Severity: Medium**

- **User impact:** CLI failures are half-translated: a Spanish user sees `Datos no válidos: brief.references: a reference is attached at most once.`, and pt-BR gets the same English tail. The actionable part of the message — what is actually wrong with the input — stays in a language the user did not select.
- **Issue:** `tools/cli/src/errors/domain-messages.ts:30-35` forwards `InputIssue.message` unchanged, and the fallback path in `tools/cli/src/errors/error-report.ts:84-95` appends `error.message`. Both values originate as English core/Zod validation text.
- **Recommendation:** Map stable validation reasons or Zod issue codes to CLI catalogue keys, passing paths and ids through as parameters. For details with no mapping, emit a localized category plus `studio doctor` guidance instead of the raw English sentence.

## 8. `trace.json` findings are persisted in the operator's shell language

**Severity: Medium**

- **User impact:** The durable evidence that a render stayed network-isolated now reads differently depending on whose terminal produced it, so records from two machines cannot be compared or aggregated, and tooling that inspects findings breaks when `LANG` changes. This conflicts with the requirement that machine-readable output stay compatible.
- **Issue:** `runNetworkTrace()` (`tools/cli/src/hyperframes/network-trace.ts:117-121,204-265`) builds findings from `cliText().hyperframes.findings` and writes them into `HyperframesTraceFile.findings`, while the schema in `packages/shared/src/hyperframes/engine-files.ts:36-54` carries neither a locale field nor a stable finding code.
- **Recommendation:** Persist a stable code (plus parameters) or canonical text in `trace.json` and localize only the console rendering. If localized prose must stay in the file, version the contract and record the language that produced it.

## 9. The web and UI-kit i18n layer has no automated coverage and was never seen in es or en

**Severity: Medium**

- **User impact:** The bulk of the change — roughly 300 web and kit files, 86 client components and about a thousand message keys — ships with no assertion beyond `tsc`, and no screen behind the login was ever rendered in Spanish or English. Defects that typecheck cannot see (an unread key, a duplicated key, state that keeps its old language) reach the owner, which is how the originally reported bug survived.
- **Issue:** Neither `@studio/web` nor `@studio/ui` defines a `test` script, so the `*.test.ts` files that exist under `apps/web/src` cannot run; the CLI suite (408 tests) and the shell menu tests carry the whole verification burden. No test mounts a component and switches locale, which is precisely the gap where issues #1, #10 and #21 live. Protected routes were only checked for compiling, redirecting and emitting English `<title>`s.
- **Recommendation:** Add a `test` script to both packages and start with two cheap checks: a key-usage/parity check over `webMessages` (catching unread and duplicated keys) and a component test that switches locale while run state is mounted. Then render `/execucoes`, `/catalogo/[assetId]`, `/execucoes/[runId]` and `/execucoes/[runId]/revisao` in es and en with a fixture session before shipping.

## 10. `biometricWhatToDo` is translated in all three locales and read by nothing

**Severity: Medium**

- **User impact:** When a run stops on a biometric asset, the "what to do" guidance stays in recorded Portuguese for Spanish and English owners even though a translation exists and was paid for. The blocked-run screen gives no actionable instruction in the selected language.
- **Issue:** The `biometricWhatToDo` key appears only in the three message files. `RunWaitingNotice` routes `biometric-asset` into the branch that returns `{ ...recorded, lang: 'pt-BR' }` alongside `needs-person`, `revisions-exhausted` and `agent-failed`, so the key is never consulted. report-web.md states the biometric cause does get a rebuilt what-to-do, so either the wiring was lost or the report overstates.
- **Recommendation:** Split the biometric branch so the recorded reason stays recorded (correctly tagged) while the what-to-do comes from `biometricWhatToDo`. If the key is genuinely unwanted, delete it from all three catalogues and correct report-web.md.

## 11. Interpolated counts have no singular form

**Severity: Medium**

- **User impact:** Users see ungrammatical counts in normal operation: `1 characters`, `1 spans and 1 span events`, `1 sessions`, and the equivalent mistakes in Spanish (`1 spans y 1 eventos de span`, `1 sesiones`). It reads as a machine translation on screens that otherwise read well.
- **Issue:** Several new messages interpolate a count into a fixed plural noun — `runsEn.review.cost.characters('1')` (`apps/web/src/messages/runs/en.ts:308`) and the trace messages at `tools/cli/src/i18n/messages/traces.ts:40-43,60-62`, which also drive the `1 sessions` / `1 sesiones` line counts. The documented `count === 1` rule was not applied here.
- **Recommendation:** Apply singular selection per interpolated noun (each noun in a message decides independently) and assert zero, one and two for each affected key in all three locales.

## 12. Language metadata marks the wrong spans, and the Now panel message cannot carry one

**Severity: Medium** · *(cluster: recorded-text language boundaries — see also #1, #16)*

- **User impact:** Screen readers pronounce the wrong language. Egress rows have their localized timestamp and provider prefix read with a Portuguese voice, while the recorded Portuguese activity line in the Now panel and raw planner questions are read with the page's Spanish or English voice. Audio output is degraded in both directions.
- **Issue:** `apps/web/src/features/publishing/left-the-machine.ts:21-24` concatenates a localized prefix with recorded Portuguese prose into one string, and `components/LeftTheMachineCard.tsx:39-42` applies `lang="pt-BR"` to the whole line. In the other direction, `NowPanel.message` is a plain string, so the recorded activity from `now.json` has nowhere to put a language marker, unlike `EventLog` items which gained `messageLang`.
- **Recommendation:** Represent mixed lines as structured nodes and apply `lang="pt-BR"` only to the recorded segment. Give `NowPanel` either a `messageLang` prop or a `ReactNode` message, following the pattern already established for `EventLog` and `WaitingNotice`.

## 13. Tray menu and CLI follow the operating system, ignoring the in-app language switch

**Severity: Medium** · *(cluster: inconsistent locale source across surfaces — see also #17, #18)*

- **User impact:** An owner who selects English in the header still gets a Portuguese tray menu, and the same machine's terminal can show a third language. The language control does not mean what it appears to mean: "the entire system" follows it only in the browser.
- **Issue:** The web resolves the locale from the `vs-locale` cookie, `apps/shell/src/i18n/locale.ts` resolves it from the macOS preferred-language list (and only at launch), and the CLI resolves it from POSIX environment variables. No shared preference is read by the shell or the CLI.
- **Recommendation:** Decide and document the intended contract. If the header switch is authoritative, persist the chosen locale where the shell and CLI can read it (shared preference file or forwarded environment) and re-render the tray menu when it changes; if the OS is authoritative for native surfaces, state that in the design docs and in the UI so the switch is not mistaken for global.

## 14. Unrelated runs are bundled in the same working tree, including a frozen package.json

**Severity: Medium**

- **User impact:** Committing this tree as one change ships the light-theme tokens, catalog tabs, navbar drawer, login redesign, development auto sign-in and several new `__tests__` folders under an i18n commit message. A later revert of a localization defect would take unrelated product changes with it, and nobody can review the i18n change in isolation.
- **Issue:** The tree holds 307 modified files plus 43 untracked paths spanning at least six concurrent runs, and `packages/toolbox/package.json` gained a `test` script that the brief's package.json freeze forbade and that neither source report claims.
- **Recommendation:** Stage by intent rather than `git add -A`, splitting i18n from the theme, catalog, navbar, login and dev-sign-in work. Find an owner for the `packages/toolbox/package.json` line and either justify it against the freeze or drop it.

## 15. `.env.example` tells the owner that a passphrase variable is not a secret

**Severity: Medium**

- **User impact:** An owner following the file's own comment can put their passphrase in a committed example file, or fail to realize that the development auto sign-in stores it in plaintext on disk. The passphrase protects the entire studio.
- **Issue:** `apps/web/.env.example` states that these three names never hold a secret, immediately above `ENGINEOS_VIDEO_CREATOR_DEV_PASSPHRASE=`, which holds exactly that. The surrounding guards on the dev sign-in path itself (development-only compile, explicit `1` switch, 404 when off, `sec-fetch-site` check, real `POST /auth/login`) are sound; only the documentation is wrong.
- **Recommendation:** Rewrite the comment to say the passphrase belongs only in the git-ignored `.env.local`, that placing it there stores the owner's passphrase in plaintext, and that the variable must never be filled in the example file.

## 16. `NowPanel` silently falls back to Portuguese instead of reading the provider

**Severity: Low** · *(cluster: recorded-text language boundaries — see also #12)*

- **User impact:** Any future consumer that renders `NowPanel` without passing a title ships a Portuguese heading into a Spanish or English screen, with no build error to catch it. Today the web passes the title, so this is a trap rather than a visible bug.
- **Issue:** `NowPanel` defaults `title = uiMessages[DEFAULT_LOCALE].runs.nowTitle`, while every other text-rendering kit component (`Spinner`, `StatusBadge`, `ErrorState`, `EventLog`, `WaitingNotice`, `AssetCard`, `Checklist`) reads `useI18n()`. It already calls `useId`, so it runs in a client tree where the hook is available. This inverts the convention that makes the sweep trustworthy: every formatter requires a locale, so omitting it is a compile error.
- **Recommendation:** Read the heading from `useI18n()` and keep the prop as an override with no default, so a missing translation is a typecheck failure rather than a Portuguese string.

## 17. CLI locale precedence stops at the first set variable and then falls back to pt-BR

**Severity: Low** · *(cluster: inconsistent locale source across surfaces — see also #13)*

- **User impact:** With `LC_ALL=fr_FR LANG=es_ES`, a Spanish-speaking owner gets a Portuguese terminal while the same machine's browser shows Spanish. The CLI ignores a perfectly usable lower-precedence preference.
- **Issue:** `resolveSystemLocale` (called as the first statement of `tools/cli/src/main.ts`) takes the first variable that is set and is not `C`/`POSIX`, maps anything unrecognized to pt-BR, and never consults the remaining variables. The web and the shell both skip unsupported languages and continue down their lists.
- **Recommendation:** Keep POSIX precedence but continue to the next variable when the current one names an unsupported language, matching the web and shell behaviour; document the final fallback explicitly.

## 18. CLI text launched from the tray always falls back to pt-BR

**Severity: Low** · *(cluster: inconsistent locale source across surfaces — see also #13)*

- **User impact:** A double-clicked macOS app has no `LANG`, so any CLI output surfaced through the tray is Portuguese regardless of the system or in-app language.
- **Issue:** `child-environment.ts` (pre-existing, unchanged) forwards only `HOME`, `TMPDIR` and `LANG` to `studio` child processes. The new environment-based resolution in the CLI is what turns that allowlist into a language defect.
- **Recommendation:** Have the shell pass the resolved locale explicitly to child processes (an added allowlisted variable set from the shell's own resolution), if tray-launched CLI output is user-visible.

## 19. Spec pt-BR refusal sentences are hand-copied into the web catalogue

**Severity: Low**

- **User impact:** The same platform refusal now has two sources of truth. A future correction to the spec text will move the CLI and silently leave the web behind, so the two surfaces will quote different wording for the same refusal.
- **Issue:** `tools/cli/src/i18n/messages/platforms.ts` builds its pt-BR catalogue from `apiRev7ErrorTexts` and `capabilityStatusLabels` in `@studio/shared`, and `platforms.command.test.ts` asserts the spec wording. `apps/web/src/messages/common/pt-BR.ts` and `messages/platforms/pt-BR.ts` import only the types and retype the sentences by hand with a comment claiming they are verbatim.
- **Recommendation:** Import the shared constants into the web pt-BR group and fill the `{plataforma}`/`{modo}` placeholders. If the hand-typed copies must stay, add a test that renders each rev-7 reason with a known platform and mode and compares it against the shared template.

## 20. The literal checker lives outside the repository and nothing gates a regression

**Severity: Low**

- **User impact:** The 1,107 → 0 literal count is a one-time measurement nobody can reproduce. The next feature can reintroduce a hardcoded Portuguese string and pass every check, so the user's complaint will come back.
- **Issue:** `check-i18n.mjs` sits in `.agents/tasks/i18n-entire-system/`, outside the repository tree, and no ESLint rule was added to flag word-bearing literals in JSX or in text-prop positions.
- **Recommendation:** Move the checker into the repo as a package script wired into lint/CI, or add an ESLint rule covering JSX text and the text-bearing props (`aria-label`, `placeholder`, `title`, `label`, `alt`, `description`, …) with the existing 61 documented exceptions as the allowlist.

## 21. Dead message keys and an unused formatter export

**Severity: Low**

- **User impact:** None directly, but editing a dead key looks like fixing a translation and changes nothing on screen, which is how the three locales drift apart.
- **Issue:** `runs.list.loadError`, `runs.detail.loadError` and `runs.review.loadError` exist in all three locales (nine strings) and are read by nothing; the error boundaries render `common.boundaries.{runs,run,review}.error`, which carries identical sentences. `formatRelative` in `packages/ui/src/utils/format.ts` is exported from the package index with no caller.
- **Recommendation:** Delete the duplicated `loadError` keys and the unused `formatRelative` export, and let the key-usage check from #9 keep them from reappearing.
