# 03-ui-package-strings: Texts and formatting of packages/ui

## Description
Moves every user-facing string of `packages/ui/src/components/**` (status labels, dropzone, dialogs, run panels, review inputs, empty and error states) to props or `useI18n()`; `utils/format.ts` takes a locale (default pt-BR output unchanged); adds formatDate/formatDateTime/formatRelative. Lists the `packages/shared` strings that reach the screen (spec open point 1).

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: packages/ui/src/** except styles/tokens.css and i18n/*; messages ui section.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
01

## Acceptance criteria
1. No Portuguese literal remains in `packages/ui/src` outside the pt-BR catalogue.
2. pt-BR output of every formatter is identical to today's.
3. `tokens.css` is untouched.
