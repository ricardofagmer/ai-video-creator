# Ticket 10: build ffmpeg in CI from pinned sources

Status: returned degraded, inspected (2026-11-23). Supervisor follow-up: FFmpeg `sha256` pinned (Homebrew's value for the same URL, read 2026-11-23) with the signature check kept, the signature-only exception removed from `lock-tool.mjs`, Node added to the CI job. Configure flags are unproven until the first build. Added after vetting 0006 section 10 and the owner's decision
"Build in CI (Recommended)". Contract: plan 9.2, C4 rev 1.

## Outcome

The installer's ffmpeg and ffprobe are built by this repository from pinned, verified sources,
and the same build produces the complete corresponding source archive the GPL requires.

## Scope (exclusive)

- `scripts/ffmpeg-build/**`
- `apps/shell/scripts/lib/pins.mjs`, `runtime-tools.mjs`, `licences.mjs`, and the callers in
  `apps/shell/scripts/lib/` and `package-dmg.mjs` that consumed the third-party zip pins

Out of scope: `.github/workflows/**` and `scripts/release/**` (ticket 05 adds the `build-ffmpeg` job).

## Acceptance

- DI-AC-03, DI-AC-25; every source pinned by checksum or commit; fail closed on a missing pin.
- No ffmpeg binary is downloaded by packaging.

## Blocked by

Ticket 03 (returned). Blocks ticket 09 (final proof).
