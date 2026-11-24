# 06-recipes: Recipes

## Description
`features/recipes/**` (labels, defaults shown to the user, form model messages) and pages under `receitas/**`.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: apps/web/src/features/recipes/**, apps/web/src/app/(studio)/receitas/**.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
02, 03

## Acceptance criteria
1. Recipe slots, bindings and form errors are translated.
2. Stored recipe data is not translated.
