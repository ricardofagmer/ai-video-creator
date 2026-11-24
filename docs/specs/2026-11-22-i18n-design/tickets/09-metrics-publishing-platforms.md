# 09-metrics-publishing-platforms: Metrics, insights, publishing, platforms, shared errors

## Description
`features/metrics`, `insights`, `publishing`, `platforms`, `features/common/api-error-text.ts` (reason maps stay `Record<ApiRev5ErrorReason, ...>` per locale), pages `metricas/**`, `indicadores/**`, `contas/**`, `app/page.tsx`.

## Requirements
Spec `docs/specs/2026-11-22-i18n-design.md` (all of: pt-BR default unchanged, es, en, typed keys, switch, cookie, `<html lang>`, titles, locale formats).

## Technical details
- Exclusive write scope: apps/web/src/features/metrics/**, insights/**, publishing/**, platforms/**, common/**, apps/web/src/app/(studio)/metricas, indicadores, contas.
- Owner agent: frontend-coordinator.
- No git writes, no tests or builds in this ticket (final gate only, see ticket 11).
- Never edit `packages/ui/src/styles/tokens.css`.

## dependsOn
02, 03

## Acceptance criteria
1. Each api error reason has a text in pt-BR, es and en, enforced by type.
2. The api's English `message` is still never shown.
