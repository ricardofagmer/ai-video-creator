# Ticket 11: packaged app wiring (integration correction)

Status: returned degraded, inspected (2026-11-23). Supervisor follow-up: release workflow passes the two portal addresses to packaging from repository variables; dedicated uninstall-failure label added. Open: the capture browser is not offered by the installed app (no download size exists to show before consent). Found by supervisor inspection of tickets 03, 04, 07 and 10.

## Outcome

The pieces written separately meet inside the installed app.

## Seams

1. Setup window assets (`setup-preload.js`, renderer script, `setup.html`, `setup.css`) are built and staged beside `main.js`.
2. Portal address and manifest address are written into the app at packaging time (`portal-settings.json`), because an app started from Finder has no shell environment.
3. The portal origin reaches the local api through every child-environment allowlist, so its CORS opens for the portal.
4. The capture-browser offer no longer depends on a file that does not exist.
5. An uninstall failure is handled, not left as an unhandled rejection.

## Scope (exclusive)

`apps/shell/package.json` scripts, `apps/shell/scripts/{package-dmg,package-app}.mjs`, `apps/shell/scripts/lib/stage-payload.mjs`, `apps/shell/src/{portal/portal-settings.ts,electron/{shell-app,packaged-mode}.ts,setup/{setup-context,setup-paths}.ts,setup/optional/capture-browser.ts,actions/child-environment.ts}`, `tools/cli/src/{settings/cli-settings.ts,services/service-spec.ts}`.

## Blocked by

03, 04, 07, 10 (all returned). Blocks 09 (final proof).
