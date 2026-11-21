# Vetting 0005: `hyperframes` dependency (PRD 0001 R4 goal 5, vetting 0004 section 5)

Date: 2026-11-20. Author: supervisor (HyperFrames wave).
Status: **pin approved: `hyperframes` 0.9.72 exact** (owner, 2026-11-20). Static checks pass;
network trace not run (owner, 2026-11-20: "Skip the trace"), so it gates the first render (section 6).
Nothing was installed or downloaded for this vetting. Sources were the upstream repository via the
GitHub API, the npm registry's public metadata, attestation and advisory endpoints, and the copy of
0.9.72 already in the owner's npx cache (`~/.npm/_npx/702923228c2ce1e6`). Files were read, never run.

## 1. Identity: upstream to registry

| Check | Result |
|---|---|
| Upstream project | `github.com/heygen-com/hyperframes`, Apache-2.0, not archived, pushed 2026-11-21 |
| Install path upstream documents | `npx hyperframes init`, `npx hyperframes render` (README) |
| Package that builds it | `packages/cli`, manifest name `@hyperframes/cli`; the repository has no package named `hyperframes` |
| Name mismatch resolved by | `.github/workflows/publish.yml`: the CLI is built from `@hyperframes/cli` "and published as the unscoped `hyperframes` package" |
| Registry entry | `hyperframes`, repository `git+https://github.com/heygen-com/hyperframes.git`, Apache-2.0, maintainers `jrusso1020`, `vancejs` (heygen.com) |
| Publishing | npm trusted publishing (OIDC `id-token: write`, protected environment), `npm publish --ignore-scripts` |
| Provenance (registry attestations, read) | 0.9.17, 0.9.58 and 0.9.72 each carry an npm publish attestation and SLSA v1 provenance naming `heygen-com/hyperframes` `.github/workflows/publish.yml` at `refs/heads/main` |
| Tarball integrity | the cached 0.9.72 `sha512-c7dC2WL0…mf1FPw==` equals the registry's `dist.integrity` |

The attestation bundles were read, not cryptographically verified; `npm audit signatures` does
that after the install and is part of the install step (section 6).

## 2. Versions and cadence

607 stable releases since 0.1.0 (2026-03-23); 0.9.0 on 2026-11-02; often several releases a day.
`latest` is **0.9.72** (2026-11-20 04:14 UTC); upstream `main` already reads 0.9.74. No candidate
is deprecated. The newest release at least 14 days old is **0.9.17** (2026-11-05).

| Version | Published | Direct deps differ from 0.9.72 | Known advisories in those deps |
|---|---|---|---|
| 0.9.17 | 2026-11-05 | `undici` **7.25.0 exact**, `hono ^4.0.0`, `@hono/node-server ^2.0.5`, `adm-zip ^0.6.0`, `sharp ^0.35.0` | `undici` 7.25.0: 29 (11 high: TLS validation bypasses, cache poisoning, DoS); the exact pin cannot be lifted by a semver range |
| 0.9.58 | 2026-11-16 | same as 0.9.72 | none (the spike version, no longer in the cache) |
| 0.9.72 | 2026-11-20 | — | none |

The two-week age habit and security pull apart here: the only version old enough ships an exact
`undici` with high advisories. Recommendation in section 7.

## 3. Package contents (0.9.72)

- 25.5 MB unpacked, 735 files; bins `hyperframes` and `hyperframes-localize-fonts`; `engines.node >=22`.
- The internal `@hyperframes/*` packages are bundled into `dist/`; none appears in the tree.
- No lifecycle script in `hyperframes` itself (`scripts` are dev-only: build, test, typecheck).
- 18 direct dependencies, `sharp` optional: `hono`, `@hono/node-server`, `open`, `acorn`, `citty`,
  `debug`, `giget`, `yauzl`, `ignore`, `undici` 7.30.1, `adm-zip`, `esbuild`, `fontkit`, `postcss`,
  `css-tree`, `puppeteer-core`, `compare-versions`, `@puppeteer/browsers`.

## 4. Dependency tree (0.9.72, darwin-arm64, as installed in the npx cache)

- **75 packages**, 108 MB on disk; every one resolved from `registry.npmjs.org` with an integrity hash.
- **Install scripts:** only `esbuild@0.28.2`, already on `onlyBuiltDependencies` in
  `pnpm-workspace.yaml`. `sharp@0.35.5` uses prebuilt `@img/sharp-darwin-arm64` and
  `@img/sharp-libvips-darwin-arm64` with no script. No allowlist change is needed.
- **Advisories:** npm bulk advisory query on all 75 name@version pairs: **none**.
- Notable resolutions: `puppeteer-core@25.17.0`, `@puppeteer/browsers@3.2.7`, `chromium-bidi@157.0.8090-0`,
  `ws@8.23.0`, `undici@7.30.1`, `hono@4.13.18`, `adm-zip@0.6.1`, `giget@3.3.1`, `postcss@8.5.33`.
- Only darwin-arm64 optional packages are present; other platforms' optional packages were not
  checked (the studio runs on one Mac).

## 5. Chrome and network surface (static)

- Chrome: `CHROME_VERSION = "158.0.8127.36"` (`MACOS_12_CHROME_VERSION = "150.0.7871.124"`),
  `chrome-headless-shell`, fetched by `@puppeteer/browsers` from
  `storage.googleapis.com/chrome-for-testing-public`. Already cached: `~/.cache/hyperframes/chrome`
  holds `mac_arm-158.0.8127.36` and `mac_arm-152.0.7977.30` (400 MB together).
- Hosts named in `dist/` (counted by URL origin; documentation links included): `fonts.googleapis.com`,
  `fonts.gstatic.com`, `cdn.jsdelivr.net`, `raw.githubusercontent.com`, `api.heygen.com`,
  `api2.heygen.com`, `static.heygen.ai`, `us.i.posthog.com` (telemetry), `huggingface.co`,
  `storage.googleapis.com/mediapipe-models`, `api.openverse.org`, `pixabay.com`,
  `oauth2.googleapis.com`. These back optional features (auth, share, asset search, models,
  telemetry); none is needed for a render of a self-contained template, which the trace in
  section 6 must confirm.

## 6. Not verified

- **Network trace of one render** (vetting 0004 section 5): not run, by the owner's choice. SPEC
  0008 must make it a gate before the first HyperFrames render ships: one render of a studio
  template under `sandbox-exec` with outbound network denied except loopback, the vetting 0004
  section 3 env and a studio-owned `HYPERFRAMES_CONFIG_DIR`; the render must succeed and the
  system log must show no denied connection.
- Cryptographic verification of the provenance: `npm audit signatures` after the install.
- That `HYPERFRAMES_NO_TELEMETRY=1` and `HYPERFRAMES_NO_UPDATE_CHECK=1` stop the posthog and update
  calls in 0.9.72 (code paths not traced; the trace above settles both).
- Carried from vetting 0004: audio through a render, `--docker` determinism, render time of a
  30 to 60 s short.

## 7. Recommendation

Pin **`hyperframes` 0.9.72 exact** (no range), not 0.9.17: it has a clean tree, provenance from
the upstream workflow and the version the owner's npx cache already runs. Its cost is age (one day
at vetting). The faster cadence means any pin is stale within days; upgrades are deliberate,
each re-running sections 1, 2 and 4 of this vetting. Add it only to the package SPEC 0008 assigns,
with `pnpm install` (lockfile reviewed) after the owner approves the pin.

## 8. Revisit when

- A new pin is proposed (rerun sections 1, 2 and 4).
- An advisory lands for any package in section 4.
- Upstream stops publishing with trusted publishing or provenance, or the maintainers change.
