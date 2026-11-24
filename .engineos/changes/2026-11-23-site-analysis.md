---
name: 2026-11-23-site-analysis
status: active
owner: Claude (supervisor) for the owner
spec: docs/specs/2026-11-23-site-analysis-design.md
domain: llm
security_review: pending
risk: medium
new_feature: true
release: false
---

## What
The owner gives a website URL (new run, cart checkout, or a saved site in the catalog's new
*Sites* section). The `research` stage reads the page text and one screenshot, and a new `analyst`
AI role writes a site analysis that the writer and director follow. On by default when a URL is
given; a recipe can switch it off.

## Why
The owner asked: "we also can send a site url to IA analises and create based on that, also add
this option to the pipeline of creation (is optional)". Answers: "Pipeline step (Recommended)",
"Also save in catalog", "On when a URL is given (Recommended)", "Just that page (Recommended)",
"Text + screenshot", "Approve (Recommended)", "No preview, build (Recommended)".

## Scope
See the spec's frozen contracts: packages/shared, packages/core, apps/watcher, apps/web.

## Checklist
- [x] Spec with acceptance criteria AC1–AC7 and frozen contracts
- [x] T1 shared contracts (analyst role, SiteAnalysis schemas, bounds, research params, `website` subKind)
- [x] T3 core: analyst@1 prompt, analyst packet (re-cut after escaping), SiteScreenshotTool (recorded or in-progress file, Amendment 2), writer@5, director@4
- [x] T4 web: checkout URL field, carry-over to new run, recipe checkbox, Sites section and link box, pt-BR/en/es
- [x] T2 watcher: page-screenshot runner command, research analysis, verify key-point claims, script and scenes inputs, analyst mock
- [ ] Nothing compiled yet: typecheck, lint, build and tests wait for final-checkpoint consent
- [ ] Final typecheck, lint and tests (final-checkpoint consent)
- [ ] Security review: untrusted page text and screenshot reaching the model, page-screenshot fetch

## What was made
- Shared contracts: the `analyst` role and `analyze-site` task, `SiteAnalysis` and its artifact and packet schemas, page-text bound (30,000 characters), research stage params (`siteAnalysis`, default on), and the catalog `website` subKind.
- Core:
  - The `analyst@1` prompt, with page title, page text and screenshot treated as data.
  - An analyst packet that re-cuts the text after escaping.
  - The `site-analyst` roster entry on Sonnet, and a `fallback-without-analysis` failure policy.
  - A mock analysis labelled "Simulado".
  - `SiteScreenshotTool`, which reads the recorded output or the in-progress research file with confinement, size and JPEG checks.
  - writer@5 and director@4 get the analysis as `<untrusted id="site-analysis">`.
- Watcher:
  - A `page-screenshot` tool-runner command, sharing a guarded page with page-text.
  - The research stage captures one screenshot (its own egress record) and calls the analyst. Only an authentication failure fails the stage; every other failure continues without the analysis.
  - Verify turns key points into claims. Script and scenes pass the analysis on.
  - The analyst has a mock.
- Web:
  - An https-only site URL field at checkout, carried over to the new run.
  - A recipe checkbox for "Pesquisa e análise do site".
  - A catalog Sites section with a link box that saves a site as a draft reference.
  - Messages in pt-BR, en and es.

## Not done
- Nothing has been compiled, linted, typechecked or tested; those wait for the final checkpoint.
- Tests are not updated yet: the stage-executor tests, path-confinement, the tool fixtures harness (screenshot tool) and the prompt-version tests (AC7).
- Security review pending.
- An http (not https) source URL still fails at page-text in live mode (Amendment 3).
- The catalog Sites page splits sites from references on the client, so a page can look short.

## User checklist
- [ ] Approve the final checks (typecheck, lint, build, tests) and the security review
- [x] Repackage the desktop app (installer of 2026-11-23 22:43, build FJDYWnvoyjtaw-sHQoBbe)
- [x] Install that build with the reinstall script (BUILD_ID FJDYWnvoyjtaw-sHQoBbe in /Applications, app running 2026-11-23 23:06)
- [x] Sign in on 4310 and click through the site URL field at checkout, the carry-over to the new run, the recipe step and the catalog Sites box (signed in on 127.0.0.1:4310, walked 2026-11-23; nothing saved)
- [ ] Restart the 4320 dev server if a web build runs while it is up

## Verification
- ran: `pnpm exec turbo run build --filter='!@studio/portal'` exit 0, 11 of 11 tasks (2026-11-23, run for packaging)
- ran: `pnpm run package:dmg` in apps/shell exit 0, dmg sha-256 a907b2fd…e1a9 (2026-11-23)
- inspected (2026-11-23): the installed app at /Applications runs (PID 26582); 4310 answers with the sign-in page, 4311 listens, and the watcher (PID 26198) processed a run. The installed web bundle contains the new screens' text: "Site para a IA analisar", the carry-over notice, "Pesquisa e análise do site", "Salvar um site", "Site salvo como rascunho." and the "Análise do site" card. Not clicked through: no sign-in reached the API.
- inspected (2026-11-23, signed in on 127.0.0.1:4310): the catalog Sites tab and "Salvar um site" box reject http ("Use um link que comece com https://") and show the "Site: example.com" form for https. The checkout "Site para a IA analisar (opcional)" field rejects http and accepts https. /receitas/nova?carrinho=1 shows "Pesquisa e análise do site" with "Analisar o site com IA" on by default, and it toggles. /execucoes/nova?carrinho=1 prefills URL de origem with the checkout site and shows the carry-over notice. No console errors. Nothing saved; test input removed, and the cart's 3 items are untouched.
[validation] pending — final-stage user approval required (lint, typecheck, tests)

## Human decisions
- 2026-11-23 | owner | none fired | approved | spec approved, no preview ("Approve (Recommended)", "No preview, build (Recommended)")
- 2026-11-23 | owner | none fired | deferred | final checks (typecheck, lint, build without web, test updates and tests): "Skip for now"; they stay pending until the owner reopens them. Proportional checkpoint answered checks: ask, security: skip

## Changes registered
Not a git repository; file list from modification times (2026-11-23), excluding the 12 engine and provider files of `2026-11-23-claude-code-engine`.
- packages/shared/src: agents/{analyst (new), bounds, director, index, protocol, role-contracts, writer}.ts, catalog/kind-details.ts, recipes/recipe-parts.ts
- packages/core/src/agents:
  - adapters/mock-outputs.ts, agent-roster.ts, call/role-parsers.ts, failure/agent-failure-policy.ts, index.ts
  - packets/{analyst.packet (new), generator.packets}.ts
  - prompts/{analyst.prompt (new), director.prompt, index, writer.prompt}.ts
  - tools/{mastra-tool.adapter, read-only-tool-set.provider, site-screenshot.tool (new), tool-results}.ts
- apps/watcher/src:
  - mocks/mock-agents.service.ts
  - stages/executors/{claim-evidence, research.executor, scenes.executor, script.executor, site-analysis (new), site-screenshot.placeholder (new), verify.executor}.ts
  - stages/process/runner/{browser.handlers, guarded-page (new), page-screenshot.handler (new), path-confinement}.ts
  - stages/process/{tool-runner.main, tool-runner.protocol}.ts
  - stages/shared/{site-analysis-input (new), stage-texts}.ts
- apps/web/src:
  - app/(studio)/catalogo/page.tsx
  - features/cart/{cart-instructions-store, cart-item, cart-source-url (new), cart-store}.ts, components/{CartButton, CartSourceUrlField (new)}.tsx
  - features/catalog/{asset-form/kind-detail-fields, catalog-groups, catalog-sections, catalog-tab-items, image-link-draft, site-link-draft (new)}.ts, components/{CatalogAssetItem, SiteLinkBox (new)}.tsx
  - features/common/https-url.ts (new)
  - features/recipes/recipe-form-model.ts, components/{RecipeEditor, RecipeFlowSections}.tsx
  - features/runs/components/NewRunForm.tsx
  - features/search/components/SemanticSearchPanel.tsx
  - messages/{cart, catalog, recipes, runs}/{en, es, pt-BR}.ts
- docs/specs/2026-11-23-site-analysis-design.md (new, with Amendments 1–3)

## Notes
- Amendment 2: outputs reach run.json only at the record step, so the screenshot tool also reads the in-progress research file while research is the cursor stage.
- Amendment 3: the screenshot gets its own egress record; live http source URLs still fail at page-text as before.
- Catalog list loads 100 references per page and splits sites from references client-side, so a Sites page can look short; an API subKind filter would fix it.
- `site-analysis` has no entry in watcher engine/postconditions/artifact-schemas.ts; the executor validates before writing.
- recipe-form-model.ts is 324 lines, a little over the ~300 guideline.
- Sign-in cookies are per host: a sign-in on 127.0.0.1:4310 leaves localhost:4310 signed out.
- Possible small fix: `cart-instructions-store.ts` `setSourceUrl` stores `""` when the field is emptied (instructions store null). Because `checkoutSourceUrlText` uses `typed ?? firstCartSiteUrl(cart)`, an emptied field stops the cart's first site from filling it until the cart is cleared.
