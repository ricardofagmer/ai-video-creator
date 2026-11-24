# 07-schedules: Schedules

## Description
`features/schedules/**` and pages under `agendamentos/**`; time zone and date text use `Intl` with the locale.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: apps/web/src/features/schedules/**, apps/web/src/app/(studio)/agendamentos/**.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
02, 03

## Acceptance criteria
1. Schedule forms, labels and errors are translated.
2. Date and time text follows the locale, the schedule's own time zone is unchanged.
