# Three-language interface across web, UI kit, shell and CLI

Every user-visible string in `apps/web`, `@studio/ui`, the Electron tray menu and the `studio` CLI now comes from a typed per-locale catalogue instead of a Portuguese literal, and every date, number and currency formatter takes the active locale as a required argument. pt-BR stays the source of truth and TypeScript is the enforcement mechanism (`Messages<typeof ptBR>`, `satisfies Record<Enum, …>`), so a missing key or a new enum member breaks `typecheck` instead of shipping a blank label. The web resolves the language from the `vs-locale` cookie, the shell from the macOS language list, and the CLI from `LC_ALL`/`LC_MESSAGES`/`LANG`; `apps/api`, `apps/watcher` and `packages/shared` were not touched, so no API contract moved. The acceptance case from the user's screenshot (`/execucoes` under `vs-locale=en`) is fully converted: title, subtitle, button, column headers, `$0.00` and `11/21/2026 16:27` all follow the locale, and the message-parameterized form models carry no validation change.

**Watch for:** the publish review checklist and the script-approval gate still render in the language the recipe was created in, which is Portuguese for every existing recipe (confirmed); the catalog screens use a different date/time format family than the rest of the app, giving `11/18/26, 4:02 PM` in en where the run screens give `11/18/2026 14:02` (confirmed); a translated `biometricWhatToDo` was written into all three catalogues but no code reads it (confirmed); the spec's pt-BR platform-refusal sentences were hand-copied into the web catalogue while the CLI still imports them from `@studio/shared` (confirmed); and no screen behind the login was ever rendered in es or en (confirmed).

**Verdict**: NEEDS_CHANGES

## High-level view

The shape is one catalogue per surface, each with pt-BR as the typed source and es/en checked against it: 11 feature groups under `apps/web/src/messages`, one file per command area in the CLI with the three locales side by side, and a small `uiMessages` for kit component defaults. Pure model functions (`buildAssetMetadata`, `buildRecurrence`, `buildPublishRequest`, `emptyRecipeForm`) take their message section as a parameter instead of importing it.

Language selection is not uniform across the three surfaces, and in one case not uniform with the request. The web follows the in-app flag switch, as asked. The tray menu follows the macOS language list, so an owner who picks English in the header still gets a Portuguese tray menu until the next launch. The CLI follows POSIX variables and stops at the first one that is set, so `LC_ALL=fr_FR LANG=es_ES` yields pt-BR in the terminal while the same machine's browser shows Spanish.

The largest remaining Portuguese surface is text the product itself generated and then stored as data. New recipes get their checklist and gate labels in the creator's language, but the labels of existing recipes (including both seeds) are Portuguese and are rendered verbatim on the review screen and inside the rebuilt es/en waiting notices. The ids are stable and present in the new catalogue, so this is a lookup away from being fixed.

Dates and numbers are locale-aware everywhere, but through two different format families. The web's `lib/i18n/format.ts` and `run-labels.ts` pin an explicit 24-hour, 4-digit-year shape; the new `@studio/ui` `formatDate`/`formatDateTime` use `dateStyle`/`timeStyle: 'short'`, which gives a 12-hour clock and a 2-digit year in en. The catalog screens use the second family.

Watcher prose is the known hard case: pt-BR shows exactly what the engine recorded, es/en rebuild the line from structured fields, and anything that stays Portuguese is marked with `lang="pt-BR"`. The rebuild drops to raw enum codes for roles, recovery kinds, providers and gate ids, so some es/en event lines read like identifiers where the pt-BR line reads like a sentence.

The kit reads the locale from its provider everywhere except `NowPanel`, which defaults its heading to the pt-BR catalogue — the inverse of the formatter convention, where omitting the locale is a compile error.

The locale cookie is the only new untrusted input the web reads, and it passes an allowlist before reaching `<html lang>` or a lookup. The security observation in this area is bundled rather than i18n: the same working tree adds a development auto sign-in whose `.env.example` entry sits under a comment claiming the file's names never hold a secret, directly above a variable meant to hold the owner's passphrase.

Verification is strong where tests exist and absent where most of the change is. CLI typecheck, lint and 408 tests pass and the shell's menu tests cover all three locales; `@studio/web` and `@studio/ui` have no test script at all, so roughly 300 changed web and kit files, 86 client components and about 1,000 message keys have no automated assertion beyond `tsc`. The one-off checker behind the 1,107 → 0 result lives outside the repository, so nothing stops the next change from reintroducing a Portuguese literal.

<details>
<summary>Issues (16)</summary>

1. **Review checklist stays Portuguese** — `ReviewForm` renders the label pinned in run.json, and every existing recipe (both seeds included) has Portuguese checklist labels with ids that exist in the new catalogue. Look the label up by id for es/en and fall back to the stored one.
2. **Script-approval gate label stays Portuguese** — `RunWaitingNotice` interpolates the stored gate label into its rebuilt es/en sentence; map the exported `SCRIPT_APPROVAL_GATE_ID` to `t.recipes.defaults.scriptGate.label`.
3. **`biometricWhatToDo` never read** — the key is translated in all three catalogues but `biometric-asset` falls into the branch that returns recorded pt-BR text. Wire it, or delete the key and correct report-web.md.
4. **Catalog date format diverges** — `@studio/ui` `formatDate`/`formatDateTime` use `dateStyle`/`timeStyle: 'short'`, producing a 12-hour clock and 2-digit years in en/es on the catalog screens. Give them the same explicit options as `lib/i18n/format.ts`.
5. **Raw enum codes in rebuilt es/en lines** — agent roles, recovery kinds, providers and gate ids are interpolated unmapped into event-log and waiting-notice sentences. Add catalogue entries for them.
6. **`NowPanel` defaults to pt-BR** — it is the only kit component with a hardcoded pt-BR fallback instead of `useI18n()`; a consumer that forgets the prop ships Portuguese with no typecheck error.
7. **Spec pt-BR sentences duplicated in the web catalogue** — `apiRev7ErrorTexts` and `capabilityStatusLabels` are hand-copied into `messages/{common,platforms}/pt-BR.ts` while the CLI imports and tests the shared constants. Import them, or add an equality test.
8. **Dead keys and a dead export** — `runs.{list,detail,review}.loadError` (nine strings) duplicate `common.boundaries.*`, and `formatRelative` is exported with no caller. Remove them.
9. **`.env.example` mislabels a secret** — the dev auto sign-in block sits under "these three names never hold a secret" while `ENGINEOS_VIDEO_CREATOR_DEV_PASSPHRASE` holds the owner's passphrase in plaintext `.env.local`. Fix the comment.
10. **Tray menu ignores the in-app language switch** — the brief asked for everything to follow the header switch; the shell reads the macOS language list instead. Confirm this is acceptable or read the shared preference.
11. **CLI locale resolution diverges from web and shell** — it stops at the first set POSIX variable and falls back to pt-BR even when a lower-precedence variable names a supported language. Documented as POSIX precedence; decide whether the inconsistency is wanted.
12. **CLI text under the tray falls back to pt-BR** — the tray forwards only `HOME`, `TMPDIR` and `LANG`, and a double-clicked macOS app has no `LANG`. Forward the locale explicitly if tray-launched CLI output matters.
13. **`trace.json` findings are localized** — the network-isolation evidence file's prose now depends on the operator's shell environment. Record a stable key or code alongside the sentence.
14. **No test coverage for the web or kit i18n layer** — neither package has a `test` script, so nothing asserts locale switching or key usage. Add one, starting with a key-usage check that would have caught items 3 and 8.
15. **The checker is not in the repository** — `check-i18n.mjs` lives in `.agents/tasks/`, and no ESLint rule was added, so the zero-literal state cannot be gated on. Move it in as a lint step.
16. **Unrelated changes bundled in the working tree** — theme tokens, catalog tabs, navbar drawer, login redesign, dev auto sign-in and new `__tests__` folders share the tree, and `packages/toolbox/package.json` gained a `test` script despite the package.json freeze. Stage by intent and find an owner for the toolbox line.

Also outstanding, not actionable code changes: no screen behind the login was rendered in es or en, so at least `/execucoes`, `/catalogo/[assetId]`, `/execucoes/[runId]` and `/execucoes/[runId]/revisao` should be seen in both before shipping.

</details>

<details>
<summary>Details</summary>

### Recipe-pinned labels stay in the language they were created in

`recipe-defaults.ts` turned the eight publish-checklist items and the script-approval gate from module constants into `defaultChecklistOf(texts)` and `scriptApprovalGateOf(texts)`, so a recipe created with the interface in English gets English labels written into its definition. The ids stay stable (`claimsVerified`, `toolFactsCurrent`, …) and the gate id is now exported as `SCRIPT_APPROVAL_GATE_ID`.

What is missing is the read side. `ReviewForm` renders `item.label` straight from `run.recipe.definition.checklist` pinned in run.json:

```ts
const items = checklist.map((item) => ({ id: item.id, label: item.label, required: item.required, … }));
```

Both seeded recipes carry Portuguese labels with exactly the ids the new catalogue uses (confirmed):

```
seeds/recipes/product-tour-16x9.recipe.json
  { "id": "claimsVerified", "label": "Afirmações conferidas com as fontes ou com um teste reproduzível" }
```

So the eight compliance checkboxes on `/execucoes/[runId]/revisao` — claims verified, media licenses documented, no personal or confidential data — render in Portuguese for an owner working in English or Spanish (confirmed). The gate label behaves the same way: `RunWaitingNotice` builds the es/en sentence from the catalogue but interpolates the stored label, producing "Waiting for the gate *Aprovação do roteiro*" (confirmed).

The fix is `texts.checklist[item.id] ?? item.label` for known ids, and the same for the script gate. One nuance to decide deliberately: the seeded wording differs from the catalogue's pt-BR wording ("conferidas com as fontes" vs "verificadas em fontes"), so preferring the catalogue unconditionally would also change pt-BR text owners already read. Preferring the stored label under pt-BR and the catalogue under es/en keeps pt-BR byte-identical, which is the rule the rest of the change follows.

### Two date-format families in the same app

`lib/i18n/format.ts` and `run-labels.ts` specify the shape explicitly (`day: '2-digit'`, `month: '2-digit'`, `year: 'numeric'`, `hourCycle: 'h23'`) and strip the locale's comma, which produces the documented `11/18/2026 14:02` in en and `21/11/2026 16:27` in es. The new kit helpers take a different route:

```ts
export function formatDateTime(value: DateInput, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone }).format(toDate(value));
}
```

Run with the same instant, those options give `18/11/2026, 16:02` in pt-BR, `18/11/26, 16:02` in es and `11/18/26, 4:02 PM` in en (verified by running the formatter). `catalog-labels.ts` wraps both helpers, so `CatalogAssetItem`'s "updated at" and `AssetVersionDetails`' created, updated, read-on and captured-at rows are the only places in the app with a 12-hour clock in en and a 2-digit year in es and en (confirmed). Both reports state the clock is 24-hour in every locale; this path is the exception, and the mismatch is visible on `/catalogo`, where an asset card's date sits next to run dates from the other family.

### What the es/en watcher rebuild can and cannot say

`run-events.ts` and `RunWaitingNotice.tsx` implement the design's compromise without changing RUN-FORMAT: under pt-BR the recorded line is shown as written, under es/en the line is rebuilt from typed fields, and anything that cannot be rebuilt keeps its recorded text wrapped in `<span lang="pt-BR">`. `EventLog` grew a `messageLang` item field to carry that marker, and `WaitingNotice` accepts nodes so the same marking works there.

Two gaps. The rebuilt lines interpolate raw enum values where no catalogue entry exists: `stepRecovery: (action, …) => \`Recovery ${action}: …\`` prints `retry-same-model`, `sessionStarted: (role, model)` prints the agent role verbatim, `authenticationReason(provider)` prints the provider key, and `gateWaiting(event.gate)` prints the gate slug (confirmed). Stages, steps, checks, statuses and outcomes all got catalogues; roles, recovery kinds, providers and gate ids did not.

Second, `biometricWhatToDo` was translated into all three catalogues and is referenced by nothing (confirmed — it appears only in the three message files). `RunWaitingNotice` routes `biometric-asset` into the group that returns recorded pt-BR text:

```ts
case 'biometric-asset':
case 'needs-person':
case 'revisions-exhausted':
case 'agent-failed':
  return { ...recorded, lang: 'pt-BR' };
```

report-web.md claims "the biometric cause also gets a rebuilt what-to-do", so either the wiring was lost or the report overstates. The reason text for that cause is engine prose and reasonably stays recorded; the what-to-do is written and should be used.

Related and documented: `NowPanel.message` is a plain string, so the recorded Portuguese activity line from `now.json` cannot carry a `lang` attribute the way event rows can, and a screen reader will read it with the page's language under es/en (confirmed).

### Fail-open text, fail-closed formatters

Every formatter in this change requires a locale, so a forgotten locale is a compile error — that convention is what makes a 307-file sweep trustworthy. `NowPanel` goes the other way:

```ts
title = uiMessages[DEFAULT_LOCALE].runs.nowTitle,
```

Every other kit component that renders text (`Spinner`, `StatusBadge`, `ErrorState`, `EventLog`, `WaitingNotice`, `AssetCard`, `Checklist`, …) reads `useI18n()`. `NowPanel` already calls `useId`, so it runs in a client tree where the hook is available; the prop with a pt-BR default means a consumer that forgets it silently ships Portuguese with no typecheck signal (confirmed). The web passes `ui.runs.nowTitle` today, so this is a latent trap rather than a live bug.

### Spec constants copied instead of imported

`@studio/shared` keeps `apiRev7ErrorTexts` and `capabilityStatusLabels` as the spec's verbatim pt-BR text, and the CLI imports them directly — `tools/cli/src/i18n/messages/platforms.ts` builds its pt-BR catalogue from the constants, and `platforms.command.test.ts` asserts they still equal the section 5.3 words. The web went the other way: `messages/common/pt-BR.ts` and `messages/platforms/pt-BR.ts` import only *types* from `@studio/shared` and re-type the sentences by hand, with a comment saying they are verbatim (confirmed). The same refusal now has two sources, one tested and one not, and a change to the shared constant will move the CLI and leave the web behind silently. Either import the constants into the web's pt-BR group and fill the `{plataforma}`/`{modo}` placeholders, or add a test that renders each rev-7 reason with a known platform and mode and compares it against the shared template.

### Dead keys and a dead export

Besides `biometricWhatToDo`, `runs.list.loadError`, `runs.detail.loadError` and `runs.review.loadError` exist in all three locales (nine strings) and are read by nothing; the boundaries render `common.boundaries.{runs,run,review}.error`, which carries the identical sentences (confirmed). `formatRelative` is new in `packages/ui/src/utils/format.ts` and exported from the index with no caller (confirmed). Duplicated sentences with one live copy are how translations drift: editing the dead key looks like a fix and changes nothing on screen.

### Three catalogues in every client bundle

`messages/index.ts` statically imports pt-BR, es and en (392 KB of source, ~2,300 lines per locale) into one `webMessages` record, and 86 client components call `useWebMessages()`, so all three languages reach the browser on any route with an interactive component. The 20 `loading.tsx` boundaries became client components for the same reason. On a loopback-only app this costs nothing a user will notice, but if the catalogue keeps growing, per-locale splitting or passing the resolved section down from the server is the lever (confirmed; impact is low by context).

### Auth surface and the dev passphrase that rode along

The i18n part of the login change keeps the error mapping intact: `loginErrorText(error, t)` still branches on 401, 429 with `retryAfterSeconds`, `passphrase-not-configured`, and 403/503, only with catalogue text. `LanguageControl` on `/login` lets the language be chosen before authenticating. The locale cookie is written client-side with `Path=/; Max-Age=1y; SameSite=Lax` and read on the server through `parseLocale`, an allowlist of three values, so a tampered cookie cannot reach `<html lang>` or a message lookup.

The same file now also contains a development auto sign-in from a concurrent run, which deserves a reviewer's eye even though it is not i18n. Its guards hold up: `NODE_ENV !== 'development'` compiles the passphrase read away, the switch must be exactly `1`, the route 404s when off, it applies the BFF's `sec-fetch-site` rule, and it signs in through the api's real `POST /auth/login`, so argon2 and throttling still apply. The documentation does not hold up. `apps/web/.env.example` now reads "These three values are optional … these three names never hold a secret" immediately above `ENGINEOS_VIDEO_CREATOR_DEV_PASSPHRASE=`, which is exactly a secret (confirmed). The comment should say the passphrase belongs only in the git-ignored `.env.local`, and that putting it there stores the owner's passphrase in plaintext on disk.

### CLI: lazy reads, system env, and a localized evidence file

The CLI's hard constraint is that the locale is a module-level value set once, so any text built at import time would be pt-BR forever. An AST scan of `tools/cli/src` (tests excluded) for `cliText()`/`cliLocale()` calls outside any function body returns zero hits (verified), and `main.ts` calls `setCliLocale(resolveSystemLocale(process.env))` as its first statement, before Commander descriptions and error classes exist.

Resolution differs from the other two surfaces in a way that will surprise someone. `resolveSystemLocale` takes the first variable that is set and not `C`/`POSIX`, and maps anything it does not recognize to pt-BR without reading the lower-precedence variables, so `LC_ALL=fr_FR LANG=es_ES` gives a Portuguese terminal to a Spanish-speaking owner (confirmed). report-cli.md defends this as POSIX precedence; the web and the shell both skip unsupported languages instead, which is the inconsistency rather than the choice itself.

A second-order effect: the tray forwards only `HOME`, `TMPDIR` and `LANG` to `studio` children (`child-environment.ts`, unchanged), and a double-clicked macOS app has no `LANG` at all, so CLI text produced under the tray falls back to pt-BR regardless of the system language (likely; the allowlist is pre-existing, the new resolution order is what makes it matter).

`studio hyperframes trace` now writes its findings in the active language into `trace.json`:

```ts
const text = cliText().hyperframes.findings;
if (log.status !== 'read') findings.push(text.logUnavailable);
```

Nothing reads that text back (`engineState` reads `result` only), so no logic depends on it, but `trace.json` is the durable evidence that the render stayed network-isolated, and its language now depends on whichever shell produced it (likely). A stable key or code alongside the localized sentence would keep those records comparable across machines.

Commander's own `Usage:`, `Options:`, `Commands:` and `error:` strings stay English in all three locales. That is decision 4 in report-cli.md and it keeps pt-BR byte-identical, so it is accepted here; it remains the most visible mixed-language text in `--help`.

### What the checks prove and what they don't

I re-ran the checks that do not touch the dev server or `next build`:

| Check | Result |
| --- | --- |
| `pnpm --filter @studio/web typecheck` | pass |
| `pnpm --filter @studio/ui typecheck` | pass |
| `pnpm --filter @studio/cli typecheck` | pass |
| `pnpm --filter @studio/cli test` | 408 tests, 408 pass |
| `pnpm --filter @studio/shell test` | 1 failure, `studio-invoker.test.ts` |

The shell failure is an environment-variable ordering assertion; neither `studio-invoker.test.ts` nor `child-environment.ts` appears in the working-tree diff, so it is pre-existing and out of scope, as report-web.md states.

Two independent checks of my own. A parity walk over `webMessages` found 53 en values identical to pt-BR, all brand, technical or proper nouns (`Status`, `Hash`, `FPS`, `LoRAs`, `Claude`), with no untranslated Portuguese. A scan for word-bearing literal props (`aria-label`, `placeholder`, `title`, `label`, `header`, `description`, `alt`, `emptyText`, `caption`, `loadingLabel`) across `apps/web/src` and `packages/ui/src` returned two hits, both URL placeholders. The sweep is thorough.

Not tested: anything in `apps/web` or `packages/ui`. Neither package has a `test` script, so the three `*.test.ts` files that exist under `apps/web/src` cannot run through `pnpm test`, and the i18n layer — 11 message groups, ~1,000 keys, 86 client components calling `useWebMessages`, every message-parameterized model function — has no assertion beyond `tsc`. The two wiring defects in this review (`biometricWhatToDo` unread, `loadError` duplicated) are exactly what a key-usage test would catch and what typecheck cannot see.

Not verified visually: every screen behind the login. report-web.md explains that sign-in was impossible, and the 19 protected routes were only confirmed to compile, redirect and emit English `<title>`s. The dev auto sign-in that landed in the same working tree is what would unblock this for the next pass, given the owner's passphrase. The user's complaint was about page bodies rather than titles, so at least `/execucoes`, `/catalogo/[assetId]`, `/execucoes/[runId]` and `/execucoes/[runId]/revisao` should be seen in es and en before this ships.

Not enforced going forward: `check-i18n.mjs` lives in `.agents/tasks/i18n-entire-system/`, outside the repository, and no ESLint rule was added (`git diff` shows no eslint config change). The 1,107 → 0 result is a point-in-time measurement the team cannot reproduce or gate on.

### Changes from other runs in the same working tree

The uncommitted tree holds 307 modified files plus 43 untracked paths, and the i18n work is not separable by directory. Also present: the light-theme token run (`packages/ui/src/styles/tokens.css`, `design/tokens.md`), the catalog tabs and grouping run (`catalog-groups*`, `CatalogKindTabs`, `CatalogGroupedGrid`), the navbar drawer run (`AppShell` gaining `DrawerSection`, `Icon`, `navigation-groups.ts`), the login landing redesign (`login.module.css`, the hero markup in `login/page.tsx`), the dev auto sign-in, new `__tests__` folders across `packages/core`, `apps/watcher` and `apps/api`, and `.engineos/memory/index.json`. `packages/toolbox/package.json` gained a `test` script, which the brief's package.json freeze forbade and which neither report claims (confirmed; it belongs to whichever run added `packages/toolbox/src/__tests__/`). Whoever commits this needs to stage by intent rather than `git add -A`, and the toolbox `package.json` line needs an owner.

</details>

<details>
<summary>File map</summary>

Reference only; the full change is the working-tree diff (`git -C video-studio diff`, 307 modified files, plus 62 new files under the five `i18n`/`messages` directories).

- `apps/web/src/messages/**` (33 new files) — web catalogue: 11 feature groups × pt-BR/es/en, plus the three roots and `index.ts`.
- `apps/web/src/lib/i18n/{server,client,format}.ts` — `getI18n()`, `useWebMessages()`, and the locale-required date and number formatters.
- `apps/web/src/app/(studio)/**` (29 files) — pages, 20 `error.tsx`/`loading.tsx` boundaries now reading `t.common.boundaries`, every static `metadata` replaced by `generateMetadata`.
- `apps/web/src/features/**` (29 files) — label modules reduced to pure helpers, model functions taking their message section, watcher-text rebuild in `run-events.ts` and `RunWaitingNotice.tsx`, product text moved out of `recipe-defaults.ts`.
- `packages/ui/src/i18n/**` (7 new files) + 25 modified kit files — `uiMessages`, `I18nProvider`, locale negotiation, locale-required formatters, `EventLog.messageLang`, `NowPanel.title`.
- `tools/cli/src/i18n/**` (16 new files) + 76 modified CLI files — per-area catalogues, `resolveSystemLocale`, every module-level Portuguese constant turned into a catalogue read.
- `apps/shell/src/i18n/locale.ts` (+ test) and 5 modified shell files — macOS language list to menu locale, `shellLabels` for three locales, locale threaded through `menu-model` and `format-slot`.
- `design/`, `docs/` (9 files) — new `design/glossario.md`, "pt-BR only" wording updated in PRD 0001, ADR 0001, SPEC 0002 and `docs/design-system.md`, plus the i18n design spec revision.
- `apps/web/.env.example` — dev auto sign-in variables (bundled from another run).

</details>
