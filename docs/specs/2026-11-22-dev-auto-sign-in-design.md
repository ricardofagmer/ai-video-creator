# Dev auto sign-in — design

Date: 2026-11-22 · Domain: frontend, security · Risk: high (auth change; development only)

## Problem

The owner asked that the development environment skip the login page: "for develop env set
password to skip login". Under `next dev` they re-enter the passphrase after every expired session
and every restart, which slows UI work down. The production login (design/telas/01, ADR 0001) must
stay exactly as it is.

## Chosen approach

Auto sign-in through the real login, development only.

- Two variables in the untracked `apps/web/.env.local` (`.env.*` is git-ignored):
  `ENGINEOS_VIDEO_CREATOR_DEV_AUTO_LOGIN=1` (explicit switch) and
  `ENGINEOS_VIDEO_CREATOR_DEV_PASSPHRASE` (the passphrase set with `studio passphrase set`).
  `apps/web/.env.example` lists both with empty values. No passphrase is written in code or in git,
  and there is no fallback value.
- It is on only when all three hold: `NODE_ENV` is `development` (only `next dev` sets it; the
  check reads `process.env.NODE_ENV` literally, so a production build compiles it to "off"), the
  switch is exactly `1`, and the passphrase is non-empty and within the login schema's limit.
- `/login` (server) redirects to the route handler `GET /login/dev` when it is on, the owner has no
  session and the URL has no `motivo` or `manual` parameter.
- `/login/dev` (Node runtime, `src/app/login/dev/route.ts`) answers 404 when it is off, and 403
  unless `Sec-Fetch-Site` is `same-origin` or `none` (the BFF's Fetch Metadata rule). Otherwise it
  posts the passphrase server-to-server to the api's real `POST /auth/login`, through the same C10
  server transport as every Server Component. The api still runs argon2 verification, the login
  throttle and the Origin check. On 200 it relays only the `studio_session` cookie the api issued
  and answers 303 to `/execucoes`, with a relative `Location` so the cookie and the next page stay
  on the same host.
- On any failure (wrong passphrase, throttled, api unreachable, origin refused) it answers 303 to
  `/login?motivo=login-dev-falhou`. The page then shows a warning (in development only) and the
  normal form, and does not redirect again.
- The passphrase never reaches the browser: it is read only inside the route handler, from a
  `server-only` module. It is not a `NEXT_PUBLIC_` variable, it is never passed as a prop and never
  put in a URL. The only thing logged is an event name with the status or error name, never the
  value.

Known effects, accepted for development:

- "Sair" lands on `/login`, which signs the owner straight back in. To see the form in
  development, open `/login?manual` or turn the switch off.
- A wrong passphrase in `.env.local` costs one failed attempt per visit to a bare `/login`. That
  counts toward the api's 5-per-15-minutes throttle, and the failure notice stops further tries.
- An expired session lands on `/login?motivo=sessao-expirada`, which shows the form. Every `motivo`
  stops the redirect, so a cookie the browser refused cannot cause a sign-in loop.

## Rejected alternatives

- **Turn the api's session guard off in development.** Rejected: a single misread environment
  variable would leave every api route open. It would also skip the very code path the web is
  being developed against.
- **Prefill the passphrase field in development.** Rejected: the passphrase would be sent to the
  browser in the page props, and the owner still has to press Entrar.
- **Sign in from middleware.** Rejected: middleware runs on the edge runtime, cannot use the
  `server-only` server transport and runs on every request. A single route handler keeps the
  secret in one place.

## Rollback

Remove `ENGINEOS_VIDEO_CREATOR_DEV_AUTO_LOGIN` from `apps/web/.env.local`, or set it to anything
other than `1`, and the login page behaves exactly as before. To remove the feature itself, delete
`src/app/login/dev/route.ts` and `src/features/auth/dev-auto-login.ts`, and drop the redirect and
the notice from `src/app/login/page.tsx`.

## Acceptance

- `next dev` with both variables set: opening `/` or `/login` lands on `/execucoes`, signed in.
- `next dev` without the switch: `/login` shows the form and `/login/dev` answers 404.
- `next start` (production) with both variables present: `/login` shows the form and `/login/dev`
  answers 404.
- A failed dev sign-in shows the warning once, with no redirect loop.
- The passphrase is not in any client bundle, page HTML, URL or log line.
- `@studio/web` typecheck and lint pass.
