# 05-catalog: Catalog and asset form

## Description
`features/catalog/**`, `features/search`, `features/promotion`, pages under `catalogo/**` including validation messages in `asset-form-model.ts`.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: apps/web/src/features/catalog/**, search/**, promotion/**, apps/web/src/app/(studio)/catalogo/**.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
02, 03

## Acceptance criteria
1. Form validation messages are catalogued and typed.
2. Byte sizes and dates follow the locale.
