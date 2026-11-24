# 11-final-proof: Catalogue tests and final checks

## Description
Final-gate ticket. Writes `parseLocale`, `negotiateLocale`, `resolveLocale` and catalogue parity tests (same key paths and parameter arity in pt-BR, es, en); then, only with the owner's answer to ONE final question, runs lint and typecheck. Tests and builds need explicit approval.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: packages/ui/src/i18n/*.test.ts, apps/web/src/messages/*.test.ts.
- Owner agent: test-writer.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
10

## Acceptance criteria
1. Tests exist for the three locale functions and for catalogue parity.
2. Lint and typecheck are asked as one clickable question and run once.
3. Result is reported honestly, including anything not run.
