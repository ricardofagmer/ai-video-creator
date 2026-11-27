# 01-i18n-core: Locale module, catalogue types, provider

## Description
Contract owner. Creates `packages/ui/src/i18n/` (Locale, LOCALE_COOKIE_NAME `vs-locale`, parseLocale, negotiateLocale, resolveLocale, I18nProvider, useI18n), `apps/web/src/lib/i18n/server.ts` (`getI18n`, server-only), empty typed catalogues `apps/web/src/messages/{pt-BR,es,en}.ts`, root `layout.tsx` (`<html lang>` from the locale, provider). Decides section "Parameterised texts": functions stay in catalogues, client components receive a locale id and import the catalogue in the client bundle, or a serialisable param format; one choice, documented in the spec.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: packages/ui/src/i18n/*, packages/ui/src/index.ts, apps/web/src/lib/i18n/*, apps/web/src/messages/*, apps/web/src/app/layout.tsx.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
none

## Acceptance criteria
1. Cookie, then Accept-Language (pt*, es*, en* only), then pt-BR; unknown cookie values are ignored.
2. `<html lang>` equals the resolved locale.
3. A key missing in es or en fails `typecheck`.
4. No inline script is added.
