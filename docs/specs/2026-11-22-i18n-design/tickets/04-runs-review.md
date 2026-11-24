# 04-runs-review: Runs, review and learnings

## Description
`features/runs`, `features/review`, `features/learnings`, pages under `execucoes/**` (titles via `generateMetadata`, loading, error), run labels and error texts.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: apps/web/src/features/runs/**, review/**, learnings/**, apps/web/src/app/(studio)/execucoes/**.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
02, 03

## Acceptance criteria
1. Every string on the run list, new run, run page and review page comes from the catalogue in all three languages.
2. pt-BR text is unchanged.
3. Dates and costs use the active locale.
