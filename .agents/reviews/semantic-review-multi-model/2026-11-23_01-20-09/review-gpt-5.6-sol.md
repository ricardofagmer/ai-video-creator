# System-wide pt-BR, Spanish, and English localization

## Summary

The change moves user-facing web, UI-kit, macOS shell, and CLI text into typed pt-BR, Spanish, and English catalogues, then passes the active locale through metadata, forms, boundaries, sorting, and display formatters. The reported Runs-list failure is addressed: its labels, currency, date, stage, empty state, and action now follow the selected locale. The shell and CLI derive language from the operating system without adding dependencies or changing route names, command names, flags, or exit codes. Several visible paths still break the language contract, especially live-run state retained across a flag switch and untranslated CLI framework/error text.

**Watch for:** **confirmed** live event rows and the held “building plan” message remain in the previous language after a flag switch; **confirmed** Commander help chrome and core validation details remain English under pt-BR/es; **confirmed** the shared session timestamp still uses a 12-hour English clock; **likely** localized findings make `trace.json` language-dependent despite the machine-output compatibility requirement.

**Verdict**: NEEDS_CHANGES

## High-level view

The web now uses one typed catalogue shape across all locales. Server pages read it through `getI18n()`, and client components use `useWebMessages()`. Static sampling confirmed translated values across Runs, Catalog, Recipes, Schedules, Comparisons, Insights, Accounts, Metrics, Curation, Review, and Login.

The live run page stores already-translated event rows while retaining its byte cursor. Its “Now” panel also holds a translated fallback under a key that excludes locale. Because a Next.js refresh preserves client state, switching flags does not relocalize those existing values.

The CLI locale precedence matches the requested `LC_ALL`, `LC_MESSAGES`, `LANG`, then pt-BR behavior. Translation stops at Commander’s built-in headings and diagnostics, and domain-error paths append English core/Zod details to a translated lead.

Currency and the principal run/date formatters follow locale, but the shared UI date-time helper still uses the locale’s default clock and some count messages lack singular forms. Persisted trace findings also depend on process locale, and recorded pt-BR prose is not always marked at the exact language boundary.

The typed catalogues, lint, type checks, CLI tests, and literal scans provide structural coverage. They do not exercise an authenticated language switch, where the retained-state defects occur.

<details>
<summary>Issues (8)</summary>

1. **Live-run text survives locale changes (confirmed)** — Existing event rows and the held plan-building message remain in the previous language after a flag switch. Store raw events and format them at render time, or reset/refetch locale-dependent state when the locale changes.
2. **Commander interface remains English (confirmed)** — pt-BR and Spanish help/errors still show `Usage`, `Options`, `Commands`, `display help for command`, and `error: unknown option`. Configure Commander’s generated help and diagnostics from the active catalogue while preserving command names, flags, and exit codes.
3. **CLI validation details remain English (confirmed)** — Translated CLI error leads append raw English core/Zod issue messages. Map stable issue reasons/codes to catalogue entries and use a localized safe fallback for unknown details.
4. **Session time falls back to a 12-hour clock (confirmed)** — The English session-expiry label renders values such as `4:27 PM`, contrary to the agreed 24-hour convention. Set `hourCycle: 'h23'` in the shared date-time formatter and test every locale.
5. **Singular count forms are missing (confirmed)** — New web and CLI messages can render `1 characters`, `1 spans`, and `1 sessions`, with equivalent Spanish errors. Apply singular selection independently to each count and test zero, one, and two.
6. **`trace.json` findings vary by locale (likely)** — Localized diagnostic prose is persisted without a locale or stable code, making a machine-readable file depend on `LANG`. Persist canonical codes/text and localize console output, or version and label the record.
7. **Recorded-text language tags cover the wrong content (confirmed)** — Egress rows mark localized prefixes as pt-BR, while `now.json` activity and planner questions have no language metadata. Structure mixed lines and apply `lang="pt-BR"` only to recorded Portuguese segments.
8. **Authenticated locale transitions are untested (confirmed)** — Checks cover catalogue shape and static values, but no browser/component test switches locale while protected client state is mounted. Add a focused live-run transition test and run the protected-route acceptance pass when a fixture session is available.

</details>

<details>
<summary>Details</summary>

### Locale refresh on the live run page

**Confirmed concern.** `useRunLive` builds `EventLogItem` objects with the current catalogue, stores their translated strings, and advances `cursorRef` (`apps/web/src/features/runs/hooks/useRunLive.ts:95-128`). When `locale` changes, polling restarts, but the cursor remains at the end and prior rows survive through `appendEvents(previous.events, read.items)`. A `router.refresh()` preserves this client state, so only newly appended rows use the new language.

`RunNowCard` behaves similarly for the localized “building plan” fallback. `positionKey()` contains status, stage, step, and attempt but not locale, and `useStepMessage()` returns the held string while that key is unchanged (`apps/web/src/features/runs/components/RunNowCard.tsx:31-49`). Switching from English to Spanish during plan construction leaves “Building the run plan” visible until the run moves.

Keep raw `RunEvent` values and derive display rows from the current catalogue, or reset both the cursor and rows on locale change. Include locale in the held Now-message key, or localize the fallback after selecting the held activity. Test a locale switch without changing run position.

### CLI catalogue stops before Commander and core validation details

**Confirmed concern.** `buildProgram()` localizes command and option descriptions but only configures Commander’s output writers (`tools/cli/src/program/program.ts:195-205`). Under `LANG=es_ES.UTF-8`, direct execution still prints `Usage:`, `Options:`, `Commands:`, `display help for command`, `[options]`, and `error: unknown option ...`. The implementation records this as deliberate, but the authoritative scope includes CLI help text and errors.

Configure Commander’s help titles, help option, and output-error formatter from the active catalogue. Add pt-BR and Spanish assertions for root/subcommand help, unknown options, missing arguments, and unknown commands.

**Confirmed concern.** The domain mapper forwards `InputIssue.message` unchanged (`tools/cli/src/errors/domain-messages.ts:30-35`), and the fallback can append `error.message` (`tools/cli/src/errors/error-report.ts:84-95`). These values originate in English core/Zod messages. A real Spanish result is `Datos no válidos: brief.references: a reference is attached at most once.`; pt-BR has the same English suffix.

Map known validation reasons or Zod issue codes to CLI keys and treat paths and ids as parameters. An unknown detail should produce a localized safe category and `studio doctor` guidance instead of raw English prose.

### Clock format and singular grammar

**Confirmed concern.** Shared `formatDateTime()` uses `{ dateStyle: 'short', timeStyle: 'short' }` without `hourCycle: 'h23'` (`packages/ui/src/utils/format.ts:55-57`). The studio layout uses it for session expiry (`apps/web/src/app/(studio)/layout.tsx:51`). For 21 November 2026 at 16:27, Node renders English as `11/21/26, 4:27 PM`, unlike the agreed 24-hour format. Add `hourCycle: 'h23'` and a three-locale assertion; also align the year width with the run formatter if consistency is required.

**Confirmed concern.** Some new messages interpolate counts into fixed plural nouns. `runsEn.review.cost.characters('1')` returns `1 characters`; `tracesEn.spans(1, 1)` returns `1 spans and 1 span events`; Spanish returns `1 spans y 1 eventos de span` (`apps/web/src/messages/runs/en.ts:308`, `tools/cli/src/i18n/messages/traces.ts:40-43,60-62`). Trace line counts also emit `1 sessions` / `1 sesiones`. Apply the documented `count === 1` rule to each noun.

### Persisted and recorded prose across language boundaries

**Likely concern.** `runNetworkTrace()` constructs findings from `cliText().hyperframes.findings` and writes them into `HyperframesTraceFile.findings` (`tools/cli/src/hyperframes/network-trace.ts:117-121,204-265`). The schema has no locale or stable finding code (`packages/shared/src/hyperframes/engine-files.ts:36-54`). The same diagnostic therefore produces different `trace.json` content under pt-BR, es, and en, contrary to the machine-output compatibility requirement. Persist stable codes/parameters or canonical record text and localize only console rendering; otherwise version the contract and record its language.

**Confirmed concern.** Egress rows concatenate a localized timestamp/provider with a recorded Portuguese summary, then apply `lang="pt-BR"` to the whole line (`apps/web/src/features/publishing/left-the-machine.ts:21-24`, `components/LeftTheMachineCard.tsx:39-42`). Screen readers consequently pronounce the localized prefix as Portuguese. The latest `now.json` activity passed to `NowPanel.message` and raw planner questions have no language metadata. Represent mixed lines as structured nodes and tag only recorded segments; let `NowPanel` carry `messageLang` or a `ReactNode`.

The change keeps untrusted values as React text and maps API errors through stable status/reason values. Login translation leaves the passphrase in component state and the POST body and does not alter token handling or redirects.

### Verification leaves locale transitions untested

**Confirmed coverage gap.** The strict web/UI/shell scan reports zero unallowlisted literals with 61 documented exceptions. The CLI scan reports 13 candidates, all locale codes, generated-video text, or technical false positives. Web and UI typecheck/lint pass; CLI typecheck/lint and all 408 tests pass. Shell typecheck/lint pass, while its unrelated, pre-existing environment-order assertion remains the reported 119/120 failure.

Static execution sampled more than ten surfaces in every locale. The English Runs sample produced `Runs / New run / Run / Recipe / Status / Current stage / Cost / Started`, `$0.00`, and `11/21/2026 16:27`; Catalog, Recipes, Schedules, Comparisons, Metrics, Insights, Accounts, Login, Publishing, shell, and CLI values also switched. Protected page bodies were not browser-tested because no fixture session or owner credential was available, and this review did not touch the running server as instructed. Add the focused transition tests above and run the authenticated acceptance pass when a fixture session exists. `next build` was not run, as required.

</details>

<details>
<summary>File map</summary>

The local diff command was denied by workspace permissions, so this map follows the authoritative `report-web.md` and `report-cli.md` inventories and current file contents. No PR comment thread applies to this local working-tree review.

- `apps/web/src/messages/{pt-BR,es,en}.ts` and `apps/web/src/messages/{runs,catalog,recipes,schedules,curations,metrics,common,publishing,platforms,auth}/**` — compose the typed three-language web catalogue.
- `apps/web/src/lib/i18n/format.ts`, translated feature label/model/server modules, and feature components — consume active-locale messages for formatting, validation, actions, and failures.
- `apps/web/src/app/layout.tsx`, `app/login/page.tsx`, and `app/(studio)/**/{page,error,loading}.tsx` — localize metadata, route bodies, loading states, and error boundaries without changing URL slugs.
- `packages/ui/src/i18n/messages/{pt-BR,es,en}.ts`, `packages/ui/src/utils/format.ts`, `AssetCard.tsx`, `NowPanel.tsx`, and `EventLog.tsx` — extend shared messages, require locale-aware formatting, and carry recorded-text metadata.
- `apps/shell/src/i18n/locale.ts`, `menu/{labels,format-slot,menu-model}.ts`, and `electron/shell-app.ts` — resolve the macOS preferred language and render a localized tray menu.
- `tools/cli/src/i18n/**` — add system-locale resolution and typed CLI catalogues.
- `tools/cli/src/{main,program,output,errors,platforms,schedules,metrics,insights,doctor,models,commands,hyperframes,traces,passphrase,runs,ui}/**` — replace human CLI literals and locale-sensitive formatting while preserving command and flag names.
- `design/glossario.md` and the updated design, PRD, ADR, specification, and design-system documents listed in `report-web.md` — document the three-language contract and terminology.

Full local diff pointer: `git diff` from `/Users/ricardofagmer/projects/ai-video-creator/video-studio` (workspace policy denied execution). Source inventories: `/Users/ricardofagmer/projects/ai-video-creator/.agents/tasks/i18n-entire-system/report-web.md` and `report-cli.md`.

</details>
