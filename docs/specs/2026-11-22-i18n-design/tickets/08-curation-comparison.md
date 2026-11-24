# 08-curation-comparison: Curations and comparisons

## Description
`features/curations/**`, `features/comparisons/**`, pages under `curadorias/**` and `comparacoes/**`.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: apps/web/src/features/curations/**, comparisons/**, apps/web/src/app/(studio)/curadorias/**, comparacoes/**.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
02, 03

## Acceptance criteria
1. Decision actions, compare forms and labels are translated.
