# 10-login-and-auth: Login, auth and LanguageSwitch on /login

## Description
BLOCKED until the owner confirms the login redesign and the dev auto sign-in route have landed. Translates `app/login/page.tsx`, `features/auth/*`, the dev route's user-facing text, mounts `LanguageSwitch` next to `ThemeToggle`, confirms the brand wording (spec open point 2).

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: apps/web/src/app/login/**, apps/web/src/features/auth/**.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
01-09 and the other session's go-ahead

## Acceptance criteria
1. `/login` shows the switch and follows the cookie, then Accept-Language.
2. The session-ended notice and sign-in errors are translated.
3. No file in this ticket was edited before the go-ahead.
