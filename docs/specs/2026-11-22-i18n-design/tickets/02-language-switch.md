# 02-language-switch: LanguageSwitch in the studio shell

## Description
`LanguageSwitch` (ui, client) styled like `ThemeToggle`; writes `vs-locale` and calls `router.refresh()`. Mounted next to `ThemeToggle` in `app/(studio)/layout.tsx`. The `/login` mount is done in ticket 10. Also translates the shell: StudioNavigation, LogoutButton, the logo aria-label.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: packages/ui/src/components/language/*, packages/ui/src/index.ts, apps/web/src/app/(studio)/layout.tsx, apps/web/src/features/shell/*.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
01

## Acceptance criteria
1. Choosing a language changes the shell text and `<html lang>` with no full reload.
2. The control is keyboard operable with accessible names in the active language.
3. `ThemeToggle` labels are translated too.
