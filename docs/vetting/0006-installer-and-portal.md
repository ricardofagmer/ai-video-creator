# Vetting 0006: desktop installer and hosted portal facts (ADR 0010, PRD Q3)

Date: 2026-11-23. Author: general-purpose worker (ticket `00-vetting`).
Status: research complete; corrections listed in the last section are for the supervisor and are
not applied to ADR 0010, the PRD, the plan or the tickets.

Scope: every statement marked **Unverified** in ADR 0010 and in the PRD of 2026-11-23 (Q3), plus
the six topics of `docs/specs/desktop-installer/tickets/00-vetting.md`. Settled decisions are not
re-examined: unsigned (ad hoc) installers, a `.dmg` built with `hdiutil`, a Vercel-hosted static
portal that calls `http://127.0.0.1:<port>` from the browser, pairing by one-time code in the URL
fragment.

Method and markers:

- **Vendor** marks a fact read on a vendor or standards page on 2026-11-23 (URL given).
- **Local** marks a value read on the owner's Mac on 2026-11-23 from files already installed in
  this repository's `node_modules`, from the existing packaged shell in `apps/shell/out/`, or from
  `codesign -dv` / `otool -L` output. Nothing was built, installed or modified.
- **Registry** marks a value read from `https://nodejs.org/dist/index.json`, a `SHASUMS256.txt`, or
  an HTTP `HEAD` response (headers only, no body downloaded).
- **Inference** marks a conclusion drawn from the facts above, not stated by a vendor.
- **Could not verify** marks a statement no primary source settled, with the reason.

Confidence is given per finding as high (primary vendor source states it), medium (primary source
implies it, or only an authoritative issue tracker or secondary source states it) or low
(estimate).

All URLs were accessed on 2026-11-23.

## 1. Summary

| # | Topic | Finding in one line | Confidence |
|---|---|---|---|
| 1a | Chrome / Edge, HTTPS page to `http://127.0.0.1` | Not mixed content. Gated by the Local Network Access (LNA) permission, named `loopback-network` since Chrome 145; prompt on first request; ordinary CORS still applies; no Private Network Access headers needed | high |
| 1b | Firefox | LNA on by default since Firefox 153 (2026-07-21) with the same `loopback-network` permission; loopback is not mixed content | high (release notes), medium (permission name) |
| 1c | Safari | Blocks `http://127.0.0.1` and `http://localhost` from an HTTPS page as mixed content. WebKit bug 171934 still NEW; no LNA implementation. The ADR's "may block" is "does block" | medium-high |
| 2 | Gatekeeper, ad hoc app from a downloaded `.dmg` | Since macOS Sequoia 15, Control-click > Open no longer overrides Gatekeeper; the only path is System Settings > Privacy & Security > Open Anyway (about one hour after the blocked attempt), then the login password. Gatekeeper may run an unmoved app from a randomized read-only path | high |
| 3 | Node binary | `https://nodejs.org/dist/v<ver>/node-v<ver>-darwin-arm64.tar.xz`, verified with `SHASUMS256.txt.asc` + `gpgv` against the `nodejs/release-keys` keyring. Proposed pin: v24.22.3 (LTS "Krypton", end of life 2028-04-30) | high |
| 4 | Static arm64 ffmpeg / ffprobe | ffmpeg.org's only macOS link (evermeet.cx) is Intel-only. A native arm64 static build exists at `ffmpeg.martin-riedl.de` (9.1, SHA-256 per file, signed zips). It bundles libx264/libx265, so it is GPL, not LGPL; shipping it brings GPL source-offer duties | high (source, GPL), medium (exact configure flags) |
| 5 | Next standalone, Prisma, onnxruntime-node, argon2 | All relocatable with caveats: standalone `server.js` binds `0.0.0.0` unless `HOSTNAME` is set; `public/` and `.next/static` must be copied; `prisma` CLI and schema engine are dev dependencies today but `migrate deploy` needs them; onnxruntime-node ships three platforms (293 MB, 87 MB for darwin-arm64) and loads via `@loader_path`; argon2 loads `@node-rs/argon2-darwin-arm64` | high (Local, Vendor) |
| 6 | Bundle size | Estimated 0.9 to 1.2 GB unpacked; the `.dmg` compressed is estimated 0.4 to 0.6 GB. ADR 0005's 400 MB trigger is exceeded by the Electron framework plus Node and ffmpeg alone. The ADR 0010 1 GB trigger is at risk unpacked | low (estimate, to measure) |

## 2. Topic 1: browser rules for an HTTPS page calling `http://127.0.0.1`

### 2.1 Mixed content (all browsers)

- The W3C Secure Contexts algorithm "Is origin potentially trustworthy?" returns "Potentially
  Trustworthy" for hosts in `127.0.0.0/8` or `::1/128` (step 4), and for `localhost` / `*.localhost`
  only when the browser follows the localhost name resolution draft (step 5). **Vendor**, high.
  Source: https://w3c.github.io/webappsec-secure-contexts/ (Editor's Draft, 10 November 2023).
- MDN: content from loopback addresses "such as `http://127.0.0.1/` or `http://localhost/`" counts as
  a secure origin, so it is not mixed content. **Vendor**, high. Source:
  https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content (last modified
  2026-08-15).
- Microsoft Edge: "localhost is considered a secure origin by the mixed content specification and
  won't be blocked as mixed content." **Vendor**, high. Source:
  https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access (updated 2026-10-06).
- Safari is the exception (section 2.4).

Consequence: prefer the IP literal `http://127.0.0.1:<port>` over `localhost` in the portal. The
spec treats the literal as trustworthy unconditionally. For the name it depends on the browser.

### 2.2 Chrome and Edge (Chromium): Local Network Access

Findings (**Vendor**):

1. A request from a public page to a loopback destination (`127.0.0.0/8`, `::1`) is a "local
   network request" and needs user permission. The prompt shipped in Chrome 142 (blog update of
   2025-09-29). High. Source: https://developer.chrome.com/blog/local-network-access (published
   2025-06-09, update 2025-09-29).
2. Chrome 145 split the permission in two: `local-network` (private addresses) and
   `loopback-network` (loopback, "localhost and 127.0.0.1"). The old name `local-network-access`
   stays as an alias. High. Source: blink-dev "Intent to Ship: Local Network Access split
   permissions", https://groups.google.com/a/chromium.org/g/Blink-dev/c/Zl3P6NHhMBw (estimated
   milestone Chrome 145, three LGTMs).
3. Edge ships LNA restrictions by default from Edge 143. They cover subresources, `fetch()` and
   subframe navigations, not main-frame navigation. High. Source:
   https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access.
4. Permission state can be read first with
   `navigator.permissions.query({ name: 'loopback-network' })`. Chrome's guide says to query
   `'local-network'` or `'loopback-network'` and not `'local-network-access'`, which "crashes the
   renderer process" in older Chrome versions. High. Source:
   https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access
   (no date shown on the page).
5. `fetch(url, { targetAddressSpace: 'loopback' })` declares a loopback target. Chrome says it
   should be "exempted from Mixed Content blocking once the user grants the permission". For an IP
   literal it is not needed, but it does no harm. High. Same source, and MDN
   https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access (last
   modified 2026-08-12).
6. Ordinary CORS still applies: LNA works "combined with standard CORS headers
   (`Access-Control-Allow-Origin`)". The older Private Network Access headers
   (`Access-Control-Request-Private-Network` / `Access-Control-Allow-Private-Network`) "were never
   enforced as a blocking requirement and are not needed as a fallback". High. Same Chrome source.
7. The permission is "denied automatically in insecure (`http://`) top-level contexts", so the
   portal must be served over HTTPS (Vercel does that). High. Same Chrome source.
8. Default Permissions-Policy allowlist for `loopback-network` is `'self'`. A cross-origin iframe
   cannot make the call unless delegated. The portal must call from its top-level document. High.
   Same sources.
9. No prompt appears if no connection is established: "The LNA permission prompt won't trigger if a
   connection isn't established to the remote endpoint." High. Source: the Edge page above. So on
   a computer without the app, the presence call fails with a network error and no prompt is shown.
10. Settings per site: **Loopback network** offers Ask / Allow / Block. A denial is remembered, and
    `fetch()` then rejects with a `TypeError`. High. Chrome guide.
11. Enterprise policies exist: `LocalNetworkAccessAllowedForUrls`,
    `LocalNetworkAccessBlockedForUrls`, plus a temporary opt-out kept up to Edge 152. Not needed
    for one owner. High (Edge names). Edge source above.

### 2.3 Firefox

- Firefox 153 (released 2026-07-21): "Local Network Access restrictions are now enabled by default
  for all users", and websites must "request permission before connecting to devices on your local
  network". **Vendor**, high. Source: https://www.firefox.com/en-US/firefox/153.0/releasenotes/.
- Firefox 154 (2026-08-18) extends it to WebSocket. **Vendor**, high. Source:
  https://www.firefox.com/en-US/firefox/154.0/releasenotes/ (as summarised by search; the 153 page
  was opened directly).
- The permission names `local-network` / `loopback-network` are documented by MDN without a
  per-browser table. One secondary source (mdn/browser-compat-data PR 30685) says Firefox supports
  both names from 153. Medium. Source:
  https://github.com/mdn/browser-compat-data/pull/30685.
- Loopback is not mixed content in Firefox (MDN, section 2.1). High.

### 2.4 Safari (WebKit)

- WebKit bug 171934, "Don't treat loopback addresses (127.0.0.0/8, ::1/128, localhost, .localhost)
  as mixed content", is still **NEW** with no resolution. A WebKit engineer wrote in 2021 that
  WebKit treats loopback as "Not Trustworthy", so an HTTPS page's request to `127.0.0.1` is blocked
  as mixed content. Comments up to 2026-08-19 report it still blocked: "All vendors except Safari
  now ship LNA in stable." It depends on bug 250607, "Implement Local Network Access", also NEW.
  WebKit engineers have argued against more localhost connections (2025-06-07). Medium-high: the
  issue tracker is a primary WebKit source, but Apple publishes no developer page stating the
  behaviour. Source: https://bugs.webkit.org/show_bug.cgi?id=171934.
- Could not verify: any Safari 26 or 27 release note changing this. No Apple release note found
  mentions it. Treat Safari as **blocked** until a real-machine check says otherwise.
- Not affected: a top-level navigation (a link that opens `http://127.0.0.1:<web port>` in a new
  tab) is not a mixed-content subresource request. Edge states LNA does not apply to main-frame
  navigation. **Inference** for Safari, medium. "Open studio" as a plain link stays usable in
  every browser.

### 2.5 What the local api must send (exact headers)

Every request the portal makes is preflighted:

- `GET /install/status` carries `Authorization`, which is not a CORS-safelisted header, so it is
  preflighted.
- `POST /install/pair` with a JSON body (`Content-Type: application/json`) is preflighted, because
  only `application/x-www-form-urlencoded`, `multipart/form-data` and `text/plain` are simple
  types.
- `GET /install/presence` with no custom header is a simple request.

Confidence high. Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS.

Required responses on the three install routes when `Origin` equals the configured portal origin:

| Request | Status | Headers |
|---|---|---|
| `OPTIONS` preflight (`Access-Control-Request-Method: GET` or `POST`) | `204` | `Access-Control-Allow-Origin: <portal origin>`, `Access-Control-Allow-Methods: GET, POST`, `Access-Control-Allow-Headers: authorization, content-type`, `Access-Control-Max-Age: <seconds>`, `Vary: Origin` |
| Actual `GET` / `POST` | as C1 | `Access-Control-Allow-Origin: <portal origin>`, `Vary: Origin` |
| Any other `Origin` | as today | no `Access-Control-*` header (DI-AC-08) |

- Do not send `Access-Control-Allow-Credentials` (C1 already says so). Do not send
  `Access-Control-Allow-Private-Network` (not needed, section 2.2 item 6).
- `Vary: Origin` is MDN's guidance when the allowed origin is a specific value rather than `*`.
- `Access-Control-Max-Age`: MDN says the default is 5 seconds and each browser caps the value. The
  caps themselves (often quoted as 7200 s in Chromium, 86400 s in Firefox) could not be verified on
  a vendor page today. A value of 600 keeps the 10-second status poll from preflighting every
  time in any browser.
- The `Host` check (421) is compatible: a fetch to `http://127.0.0.1:<port>` sends
  `Host: 127.0.0.1:<port>`.

## 3. Topic 2: Gatekeeper for an ad hoc signed app from a downloaded `.dmg`

Findings:

1. All native arm64 code on Apple silicon must carry at least an ad hoc signature
   (`codesign -s -`). Medium: stated by Apple DTS on the Apple Developer Forums and by The Eclectic
   Light Company; no Apple documentation page found today. Sources:
   https://developer.apple.com/forums/thread/740680,
   https://eclecticlight.co/2020/08/22/apple-silicon-macs-will-require-signed-code/.
2. Gatekeeper's default allows software "signed by the App Store or signed by a registered
   developer and notarized by Apple". When needed, Gatekeeper "opens apps from randomized, read-only
   locations" (App Translocation). **Vendor**, high. Source: Apple Platform Security, "Gatekeeper
   and runtime protection", https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web
   (published 2024-12-19).
3. "In macOS Sequoia, users will no longer be able to Control-click to override Gatekeeper when
   opening software that isn't signed correctly or notarized." **Vendor**, high. Source: Apple
   Developer News, 2024-08-06, https://developer.apple.com/news/?id=saqachfa.
4. The current Mac User Guide, with macOS 27 first in its version selector, gives these exact steps
   after a blocked first open. **Vendor**, high. Source:
   https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac
   1. Choose Apple menu > System Settings, then click **Privacy & Security** in the sidebar (you
      may need to scroll down).
   2. Go to **Security**, then click **Open**.
   3. Click **Open Anyway**.
   4. Enter the login password, then click **OK**.

   "This button is available for about an hour after you try to open the app."
5. The portal's instructions for the user, built from items 3 and 4:
   1. Open the `.dmg` and drag the app to **Applications**.
   2. Double-click the app in Applications. macOS refuses it. Close the dialog (do not choose
      Move to Trash).
   3. Within the hour, follow item 4.
   4. On later launches no prompt appears.

   The exact wording of the refusal dialog for an ad hoc app on macOS 27 could not be verified (no
   Apple page quotes it). Ticket 08 should take a screenshot on the owner's Mac instead of quoting
   text.
6. Could not verify on a vendor page whether a quarantined helper inside an approved bundle (the
   bundled `node`, `ffmpeg`, `ffprobe` and native `.node` / `.dylib` files under
   `Resources/runtime/`) is assessed again when spawned or loaded. Apple's only statement covers
   the bundle as a whole. Treat it as a real-machine check in ticket 03: download the `.dmg`
   through a browser so it gets the quarantine attribute, approve once, then run setup and an
   ffmpeg job.
7. Observation (**Local**): on this Mac the pnpm-managed `node` (v24.21.0), Homebrew `ffmpeg`
   9.0.2, onnxruntime's `libonnxruntime.1.31.1.dylib` and Prisma's
   `libquery_engine-darwin-arm64.dylib.node` all carry `Signature=adhoc` (`linker-signed` for
   three of them). Re-signing them ad hoc during staging, as C3 already plans, changes nothing
   material.
8. Windows SmartScreen steps (ADR 0010 "exact steps per OS version") are not assessed here. That
   is phase 2 (PRD R14, plan section 8) and needs its own vetting.

## 4. Topic 3: the Node binary to bundle

| Item | Finding | Source | Confidence |
|---|---|---|---|
| Official source | `https://nodejs.org/dist/v<version>/node-v<version>-darwin-arm64.tar.xz` (or `.tar.gz`) | https://nodejs.org/dist/index.json, https://nodejs.org/dist/v24.22.3/SHASUMS256.txt | high (Registry) |
| Release lines on 2026-11-23 | v22 "Jod" (maintenance, end 2027-04-30); v24 "Krypton" (maintenance since 2026-10-20, end 2028-04-30); v26 "Lithium" (active LTS since 2026-10-28, end 2029-04-30); v27 alpha. "Production applications should only use Active LTS or Maintenance LTS releases." | https://nodejs.org/en/about/previous-releases, https://github.com/nodejs/Release (`schedule.json`) | high (Vendor) |
| Latest in each line | v22.23.5 (2026-11-11), v24.22.3 (2026-11-10), v26.13.1 (2026-11-10); all three marked `security: true` | https://nodejs.org/dist/index.json | high (Registry) |
| Proposed pin | **v24.22.3**. It matches the owner's development Node (v24.21.0, **Local**) and `engines: node >=22`, and is supported until 2028-04-30. v22 ends 2027-04-30. v26 would also fit but nothing in the repository has run on it yet | inference | medium |
| darwin-arm64 checksums of v24.22.3 | `.tar.xz` `1d64136c8a43d648d1b3bad10797a4c995b1ca032d2bde8799de43b37f058fe5` (27,519,132 bytes, HEAD); `.tar.gz` `ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd` | `SHASUMS256.txt` of v24.22.3 | high (Registry) |
| Verification procedure | 1. `curl -fsLo nodejs-keyring.kbx https://github.com/nodejs/release-keys/raw/HEAD/gpg/pubring.kbx` (or `gpg-only-active-keys/pubring.kbx`). 2. `curl -fsO https://nodejs.org/dist/v24.22.3/SHASUMS256.txt.asc`. 3. `gpgv --keyring=./nodejs-keyring.kbx --output SHASUMS256.txt < SHASUMS256.txt.asc`. 4. `shasum -a 256 --check SHASUMS256.txt --ignore-missing`. Also pin the expected SHA-256 in the staging script, so a changed upstream file fails the build even if the signature step is skipped | "Verifying binaries" in https://github.com/nodejs/node/blob/main/README.md | high (Vendor) |
| Licence to ship | The tarball's `LICENSE` file (MIT for Node plus bundled third-party licences) goes to `runtime/licenses/node/` | inference, standard for redistribution | medium |

Note: `gpgv` is not part of macOS. The CI runner (ticket 05) needs GnuPG. On the owner's Mac, step
4 alone with the pinned hash is the minimum check.

## 5. Topic 4: a static arm64 `ffmpeg` / `ffprobe`

### 5.1 Sources

- ffmpeg.org: "FFmpeg only provides source code." It links exactly one macOS static build
  provider, evermeet.cx. The current release is FFmpeg 9.1 "Gauss" (2026-11-20). **Vendor**, high.
  Source: https://ffmpeg.org/download.html.
- evermeet.cx: "static FFmpeg binaries for macOS 64-bit Intel", and "I do not plan to provide native
  ffmpeg binaries for Apple Silicon ARM." Configured with `--enable-gpl --enable-version3`. It is
  **not usable** for an arm64-only app (no Rosetta assumption). **Vendor**, high. Source:
  https://evermeet.cx/ffmpeg/.
- Homebrew's ffmpeg (what `install.sh` uses today) is dynamically linked to
  `/opt/homebrew/Cellar/ffmpeg/...` libraries (**Local**, `otool -L`), so it cannot be copied into
  the bundle.
- Martin Riedl's builds offer macOS arm64 `ffmpeg` and `ffprobe` ZIPs for release 9.1 (built
  2026-11-20) and snapshots. Each file has a `.sha256` companion. "macOS binaries are signed (zip
  and installer) and notarized (installer)." The build script is open source (Apache-2.0) at
  `git.martin-riedl.de/ffmpeg/build-script`. Stable redirect pattern:
  `https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip`, which redirects
  (HTTP 307) to `/download/macos/arm64/1795207104_9.1/ffmpeg.zip`, 28,623,086 bytes; `ffprobe.zip`
  is 28,541,295 bytes (**Registry**, HEAD only). The build bundles libx264, libx265, aom, dav1d,
  rav1e, svt-av1, vpx, LAME, opus, libass, openssl and others. Medium-high: third-party,
  single-maintainer site, not linked from ffmpeg.org. Source: https://ffmpeg.martin-riedl.de/.
- Could not verify: the exact `configure` line of that build (the page and the build-script page do
  not show `--enable-gpl` / `--enable-version3` / `--enable-nonfree`), whether the binary has any
  non-system dylib dependency, and the uncompressed size. All three come from the binary itself
  (`ffmpeg -version`, `ffmpeg -L`, `otool -L`) at staging time. That needs a download, which this
  ticket does not make.
- Using a third-party build also needs a dependency vetting (publisher identity, history,
  reproducibility) under `supermatt:dependency-vetting`, like vetting 0002. The alternative is
  building ffmpeg in CI from the ffmpeg.org source tarball, which removes the third-party trust at
  the cost of a long CI job. This is an open choice for the owner.

### 5.2 Licence and redistribution duties

- FFmpeg defaults to LGPL 2.1 or later. "Optional parts and optimizations are covered by GPL 2 or
  later. If you use them, the GPL applies to all of FFmpeg." libx264 is named as a GPL library.
  **Vendor**, high. Source: https://ffmpeg.org/legal.html.
- **Inference**, high: any build that includes libx264 or libx265, as the Martin Riedl build does,
  is GPL (v2+, or v3 if configured with `--enable-version3`, which is the usual choice when openssl
  3 / Apache-2.0 code is linked; unconfirmed for this build). The LGPL checklist on ffmpeg.org
  (dynamic linking, no GPL libraries) cannot be met by a static GPL build, and it does not need to
  be. The studio does not link ffmpeg; it runs it as a separate executable. The redistribution
  duty is the GPL's for the ffmpeg binary itself.
- Duties when shipping a GPL ffmpeg binary inside the app. This is a summary of the GPL's terms,
  not legal advice:
  1. Ship the licence text (GPL v2 or v3 as configured, plus each bundled library's licence) in
     `runtime/licenses/ffmpeg/`.
  2. Provide the complete corresponding source for the exact binary: FFmpeg's source, every
     bundled library's source at the built versions, and the build script with its configuration.
     Provide it alongside the download (for example as a release asset next to the `.dmg`) or
     with a written offer. Linking to the third party's site is not enough on its own under GPL v3
     section 6(d) unless that site is committed to keep it available.
  3. Record the `ffmpeg -version` / `-buildconf` output in the manifest, so the shipped
     configuration is provable.
  4. Do not use a build configured with `--enable-nonfree`: ffmpeg.org lists it among flags to
     avoid, and such builds are not redistributable under the GPL. **Inference** for the "not
     redistributable" part, medium.
- If the owner prefers LGPL-only (no x264/x265), the studio's H.264 / HEVC encoding would have to
  use Apple's VideoToolbox encoders (`h264_videotoolbox`, `hevc_videotoolbox`), which are LGPL-
  compatible. Whether every recipe in the studio works with them was not assessed.

## 6. Topic 5: relocation notes for the payload

### 6.1 Next.js `output: 'standalone'`

All **Vendor** and high confidence unless stated. Source:
https://nextjs.org/docs/app/api-reference/config/next-config-js/output (last updated 2026-11-18;
the page covers the current major, and the repository uses Next 15.5.29, **Local**).

- It creates `.next/standalone` with a minimal `server.js` and only the traced `node_modules`. It
  "does not copy the `public` or `.next/static` folders by default". Staging must copy them to
  `standalone/public` and `standalone/.next/static`.
- In a monorepo the tracing root defaults to the app folder. Files outside it, including workspace
  packages `@studio/ui` and `@studio/shared` and the root `node_modules`, need
  `outputFileTracingRoot` pointing at the monorepo root. `server.js` then sits at
  `standalone/apps/web/server.js`.
- `PORT` and `HOSTNAME` are read from the environment. **Local**: in Next 15.5.29 the generated
  server uses `const hostname = process.env.HOSTNAME || '0.0.0.0'`
  (`next/dist/build/utils.js:1316`). Without `HOSTNAME=127.0.0.1`, the packaged web would listen on
  all interfaces and break PRD 0001 section 12. This is a security-relevant correction (section 9).
- `.env` / `.env.production` loaded at build time are copied into the standalone folder, so keep
  only non-secret defaults there (or delete after build).
- On Windows, a directory-symlink fallback to a junction makes the output non-relocatable
  (phase 2 note).
- Native or dynamically required assets can be missed by tracing. Use
  `outputFileTracingIncludes`. The docs give `node_modules/sharp/**/*` as a common include. Next
  depends on `sharp` (`^0.34.3 || ^0.35.5`); `@img/sharp-libvips-darwin-arm64` is 17 MB (**Local**).
- **Local**: today `apps/web/next.config.ts` has no `output` setting. Adding it changes ticket 03's
  scope (a file in `apps/web/`) or needs a separate small ticket.

### 6.2 Prisma (repository: `prisma` and `@prisma/client` 6.19.3, `prisma-client-js`, SQLite)

- **Local**: the generated client holds `libquery_engine-darwin-arm64.dylib.node` (19,356,128
  bytes) in `node_modules/.prisma/client/`, ad hoc signed. `@prisma/engines` holds
  `schema-engine-darwin-arm64` (21,686,160 bytes), used by `prisma migrate deploy`.
- The query engine loads as a Node-API library by default. A custom location can be set with
  `PRISMA_QUERY_ENGINE_LIBRARY`, and the schema engine with `PRISMA_SCHEMA_ENGINE_BINARY`. Engine
  files are downloaded into `node_modules/@prisma/engines` at install, and `PRISMA_ENGINES_MIRROR`
  changes the host. **Vendor**, high. Sources:
  https://www.prisma.io/docs/orm/v6/reference/environment-variables-reference,
  https://www.prisma.io/docs/orm/v6/more/internals/engines.
- `binaryTargets` defaults to `"native"`. That is right for a darwin-arm64 build machine (the
  owner's Mac and a macOS arm64 CI runner) and wrong for a Linux CI runner. Source:
  https://www.prisma.io/docs/orm/prisma-schema/overview/generators (v7 page; it states the default
  is `"native"`). **Vendor**, high.
- `prisma` (the CLI) is a **devDependency** of `packages/core` (**Local**,
  `packages/core/package.json`). A production-only payload would not contain it, yet setup step 3
  runs `prisma migrate deploy`. See correction 6.
- Prisma 7 removes the Rust query engine by default and drops `PRISMA_QUERY_ENGINE_LIBRARY`
  (v6 engines page). A future upgrade changes this relocation story. The pin stays on 6.x for
  this feature.

### 6.3 `onnxruntime-node` 1.31.1

- **Local / Vendor** (package README shipped in `node_modules`): prebuilt CPU binaries for macOS
  arm64 are inside the npm tarball. The `postinstall` (`script/install.js`) downloads extra files
  only for `linux/x64` (CUDA 12). darwin-arm64 has no extra download (`install-metadata.js`). High.
- **Local**: `bin/napi-v6/darwin/arm64/` holds `onnxruntime_binding.node` (323 KB),
  `libonnxruntime.1.dylib` and `libonnxruntime.1.31.1.dylib`. These are two identical 45,331,560-byte
  copies, not a symlink. The binding loads `@rpath/libonnxruntime.1.dylib` with
  `LC_RPATH @loader_path`, so it is relocatable as long as the folder moves as a whole. The loader
  requires `../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`.
- **Local**: the whole package is 293 MB because it carries linux and win32 binaries too. Staging
  can remove `bin/napi-v6/{linux,win32}` (about 206 MB). **Inference**: dropping the unreferenced
  `libonnxruntime.1.31.1.dylib` copy would save 45 MB more, but nothing in the package documents
  that file as unused. Keep it unless a real-machine run proves otherwise.
- The README states Node.js v16+ and Electron v15+ support. High.

### 6.4 `@node-rs/argon2` 2.2.2

- **Local**: the napi-rs loader first tries `./argon2.darwin-arm64.node` next to `index.js`, then
  `require('@node-rs/argon2-darwin-arm64')`, which is an optional dependency holding
  `argon2.darwin-arm64.node` (about 600 KB). It also honours `NAPI_RS_NATIVE_LIBRARY_PATH`.
  Relocatable as long as the optional platform package is in the payload's `node_modules`. High.
- No vendor page was fetched for this package. The finding rests on the installed loader code.

### 6.5 pnpm layout

- **Inference**, medium: the workspace uses pnpm's symlinked virtual store. Copying `node_modules`
  verbatim would copy symlinks that point into the source checkout and break DI-AC-03. Staging
  must either use `pnpm deploy --prod` per app (which materialises a flat copy) or dereference
  links. Next's standalone tracing already copies real files. Not verified against pnpm docs in
  this pass.

## 7. Topic 6: bundle size

Measured parts (**Local**, `du` / `ls` on 2026-11-23):

| Part | Size | Note |
|---|---|---|
| Electron 45.4.1 app as packaged today (`apps/shell/out/...app`) | 253 MB | 252 MB is `Contents/Frameworks` |
| Node binary (v24.21.0, Mach-O arm64) | 45 MB | v24.22.3 `.tar.xz` is 27.5 MB compressed (Registry) |
| `onnxruntime-node`, darwin-arm64 binaries only | 87 MB | 293 MB unpruned |
| Prisma query engine + schema engine | 41 MB | plus about 34 MB of `prisma/build` if the CLI ships |
| `@mastra/core` 1.85.0 | 99 MB per copy | the pnpm store holds three peer-variant copies |
| `next` package | 154 MB | standalone tracing copies only part of it |
| Web build `.next/server` + `.next/static` | 70 MB + 54 MB | `.next/cache` (839 MB) is not shipped |
| `@img/sharp-libvips-darwin-arm64` | 17 MB | |
| api `dist` + core `dist` | 9 MB | |
| ffmpeg + ffprobe (arm64 static, 9.1) | 57 MB compressed | uncompressed not measured; estimated 120 to 180 MB |

Estimate:

- Unpacked app: about 0.9 to 1.2 GB if `api`, `watcher` and `cli` share one production
  `node_modules`. It would be higher if each payload folder in C3 carries its own copy of
  `@mastra/core`, `onnxruntime-node` and Prisma, as the current layout
  `payload/{api,web,watcher,cli}/` + "production node_modules" implies. Low confidence.
- `.dmg` (compressed `hdiutil` image): **Inference** 40 to 55% of unpacked, so about 0.4 to 0.6 GB.
  Low confidence.
- Verdict: ADR 0005's 400 MB trigger is exceeded (Electron + Node + ffmpeg alone pass it). ADR
  0010's revisit trigger "the installer exceeds 1 GB" is likely safe for the `.dmg` but at risk for
  the installed app unless payloads share dependencies. To measure in ticket 03 with `du -sh` on
  the staged `runtime/` and `ls -l` on the `.dmg`.

## 8. Statements that remain unverified

| Statement | Why not verified | Where it gets settled |
|---|---|---|
| Safari 26/27 changed loopback mixed-content handling | No Apple release note or doc found; WebKit bug still NEW | Owner's Mac, Safari, ticket 06 real-machine check |
| Exact macOS 27 refusal dialog text for an ad hoc app | No Apple page quotes it | Screenshot in ticket 08 |
| Gatekeeper re-assessment of nested quarantined helpers | No vendor statement | Ticket 03, quarantined download test |
| Exact `configure` flags, linkage and size of the arm64 static ffmpeg | Needs the binary; no download allowed here | Ticket 03 staging (`ffmpeg -version`, `otool -L`) |
| Chromium / Firefox `Access-Control-Max-Age` caps | MDN does not list them | Not blocking; use 600 s |
| pnpm `deploy` behaviour for this workspace | pnpm docs not read in this pass | Ticket 03 |
| Windows SmartScreen steps | Phase 2 | Phase 2 vetting |

## 9. Corrections to ADR 0010 and the plan

Not applied. For the supervisor.

1. **ADR 0010, Consequences, "Unverified: Chrome asks a local network permission; Safari may block
   `http://127.0.0.1`"**: confirmed and sharpened. Chrome 142+ and Edge 143+ prompt (permission
   `loopback-network` since Chrome 145). Firefox 153+ prompts. Safari **does** block (mixed
   content, WebKit bug 171934 open). PRD Q3 can close with this report as the answer.
2. **Plan C1, CORS rule**: add explicit `OPTIONS` preflight handling on the three install routes.
   Return `204` with `Access-Control-Allow-Origin: <portal origin>`,
   `Access-Control-Allow-Methods: GET, POST`, `Access-Control-Allow-Headers: authorization,
   content-type`, `Access-Control-Max-Age: 600` and `Vary: Origin`, and send `Vary: Origin` on
   the actual responses too. ADR 0010's "GET and one POST only" must allow this `OPTIONS` or the
   status and pair calls fail in every browser. Do not add `Access-Control-Allow-Private-Network`.
3. **Ticket 06, detection logic**: a failed presence fetch means one of four states: not
   installed (connection refused, no prompt is shown), permission denied (Chromium / Firefox),
   permission prompt still open, or Safari mixed-content block. The portal should
   `navigator.permissions.query({ name: 'loopback-network' })` first (never
   `'local-network-access'`, which can crash older Chrome renderers). Show "allow access" copy on
   `prompt`, show remediation on `denied`, and treat Safari as blocked by user agent rather than
   as "not installed". DI-AC-15's 5-second "not installed" must not fire while the prompt is open.
4. **Ticket 06, fetch calls**: call `http://127.0.0.1:<port>` (IP literal, not `localhost`) from the
   top-level document with `mode: 'cors'` and `targetAddressSpace: 'loopback'`, never from an
   iframe. TypeScript's DOM lib may not declare `targetAddressSpace` (not checked); a typed wrapper
   avoids an `as` cast.
5. **ADR 0010 / plan C3 and section 5, `HOSTNAME`**: Next standalone `server.js` binds `0.0.0.0`
   unless `HOSTNAME` is set (Next 15.5.29, **Local**). The shell must start the web with
   `HOSTNAME=127.0.0.1` and an explicit `PORT`, or the "web binds 127.0.0.1" property of PRD 0001
   section 12 is lost in packaged mode. Add an acceptance line next to DI-AC-14 for the web
   listener.
6. **Plan section 5 step 3 and C3**: `prisma migrate deploy` needs the `prisma` CLI and
   `schema-engine-darwin-arm64`, but `prisma` is a devDependency. C3's payload must name where they
   live (for example `payload/cli/` or a `payload/tools/prisma/`), or migrations must be applied by
   another mechanism. Ticket 03 cannot stage it with a production-only install as written.
7. **Plan C3 layout**: `payload/{api,web,watcher,cli}/` each with "production node_modules" can
   duplicate `@mastra/core` (99 MB), `onnxruntime-node` (87 MB pruned) and Prisma (41 MB) up to
   three times. Consider one shared `payload/node_modules` for api, watcher and cli (web keeps its
   standalone tree). Also prune non-darwin onnxruntime binaries (about 206 MB).
8. **ADR 0010, "Unverified which ffmpeg build and licence"**: ffmpeg.org's only macOS provider is
   Intel-only. The arm64 candidate (`ffmpeg.martin-riedl.de`, 9.1) includes x264/x265 and is
   therefore **GPL**. Shipping it makes the release carry the GPL text and the complete
   corresponding source (or a written offer) for the exact build. Ticket 05 must publish that
   source bundle as a release asset next to the `.dmg`. The owner chooses between this
   third-party build (needs its own dependency vetting) and a CI build from ffmpeg.org source.
   Building LGPL-only would mean VideoToolbox encoders instead of x264/x265.
9. **ADR 0010, Gatekeeper wording "macOS shows 'cannot be opened' until the user allows it in
   System Settings"**: confirmed for current macOS. Control-click > Open no longer works since
   Sequoia 15. The steps are Privacy & Security > Security > Open > Open Anyway > password, within
   about an hour of the blocked attempt. The portal copy (ticket 06/08) should say this and not
   mention Control-click.
10. **Ticket 04, App Translocation**: an app opened straight from the `.dmg` or from an unmoved
    download location may run from a randomized read-only path. First-run setup renders absolute
    paths into the watcher's launchd plist (plan section 1), so setup must refuse to start, and
    ask the user to move the app to Applications, when its own path is not stable (for example
    when it contains `/AppTranslocation/` or is on the mounted `.dmg` volume). Exact detection
    rule to be confirmed on the owner's Mac.
11. **Ticket 03, Node pin and check**: pin `node-v24.22.3-darwin-arm64.tar.xz`, SHA-256
    `1d64136c8a43d648d1b3bad10797a4c995b1ca032d2bde8799de43b37f058fe5`. Verify
    `SHASUMS256.txt.asc` with `gpgv` against `nodejs/release-keys` in CI and copy the tarball's
    `LICENSE` to `runtime/licenses/node/`.
12. **ADR 0010, size**: ADR 0005's 400 MB trigger is exceeded. The estimated `.dmg` is 0.4 to
    0.6 GB and the installed app 0.9 to 1.2 GB, so the ADR 0010 1 GB revisit trigger should say
    whether it means the download or the installed app.
13. **Ticket 03 / `apps/web`**: `output: 'standalone'` plus `outputFileTracingRoot` (monorepo root)
    must be added to `apps/web/next.config.ts`, which is outside ticket 03's packaging paths. Assign
    the edit to an owner, and remember the manual copy of `public/` and `.next/static`.

## Sources

- https://w3c.github.io/webappsec-secure-contexts/
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
- https://developer.chrome.com/blog/local-network-access
- https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access
- https://groups.google.com/a/chromium.org/g/Blink-dev/c/Zl3P6NHhMBw
- https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access
- https://www.firefox.com/en-US/firefox/153.0/releasenotes/
- https://www.firefox.com/en-US/firefox/154.0/releasenotes/
- https://github.com/mdn/browser-compat-data/pull/30685
- https://bugs.webkit.org/show_bug.cgi?id=171934
- https://developer.apple.com/news/?id=saqachfa
- https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac
- https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web
- https://developer.apple.com/forums/thread/740680
- https://eclecticlight.co/2020/08/22/apple-silicon-macs-will-require-signed-code/
- https://nodejs.org/dist/index.json
- https://nodejs.org/dist/v24.22.3/SHASUMS256.txt
- https://nodejs.org/en/about/previous-releases
- https://github.com/nodejs/Release
- https://github.com/nodejs/node/blob/main/README.md
- https://ffmpeg.org/download.html
- https://ffmpeg.org/legal.html
- https://evermeet.cx/ffmpeg/
- https://ffmpeg.martin-riedl.de/
- https://git.martin-riedl.de/ffmpeg/build-script
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- https://www.prisma.io/docs/orm/prisma-schema/overview/generators
- https://www.prisma.io/docs/orm/v6/reference/environment-variables-reference
- https://www.prisma.io/docs/orm/v6/more/internals/engines

## 10. Addendum: ffmpeg pins and corresponding source (2026-11-23)

Read-only pass, all URLs accessed 2026-11-23. Only pages, small text files, HEAD requests and one
64 KiB range read of a tarball header were fetched; no zip or full archive was downloaded and
nothing in `apps/shell/scripts/lib/pins.mjs` was changed. **Verified** means read at the cited URL
on that date; **Inference** is marked with a confidence.

### 10.1 Published SHA-256 of the two zips

| File | Published SHA-256 (exact) | Checksum URL | HEAD result |
|---|---|---|---|
| `ffmpeg.zip` | `1f66e9a690a7f1c9e60b012379f8869c11818d1797f45b21dbb2f2564ba61ae1` | https://ffmpeg.martin-riedl.de/download/macos/arm64/1795207104_9.1/ffmpeg.zip.sha256 | 200, `content-length: 28623086`, `last-modified: Fri, 20 Nov 2026 20:38:26 GMT` |
| `ffprobe.zip` | `6ef2df5f575042923a28537ab37adf936f28bf3e7b85de23a1447ed447ec1dbd` | https://ffmpeg.martin-riedl.de/download/macos/arm64/1795207104_9.1/ffprobe.zip.sha256 | 200, `content-length: 28541295`, `last-modified: Fri, 20 Nov 2026 20:38:27 GMT` |

- **Verified**: both sizes equal the sizes recorded in section 5.1 and in `pins.mjs`.
- **Verified**: the build is still the current macOS arm64 *release* build. The home page lists
  "macOS (Apple Silicon/arm64) Release: 9.1 Created: 20 Nov 2026 21:38 CET" and links this
  directory; the release history (https://ffmpeg.martin-riedl.de/info/history/macos/arm64/release)
  shows 9.1 at 2026-11-20 21:38:25 CET as the newest entry. A GET (no redirect follow) of
  `/redirect/latest/macos/arm64/release/ffmpeg.zip` answers 307 to
  `/download/macos/arm64/1795207104_9.1/ffmpeg.zip`. That redirect endpoint answers 404 to HEAD, so
  probe it with GET only.
- **Verified**: the history page lists the same version more than once (for example 7.1, 6.0 and
  5.1.2 were each rebuilt), each rebuild in a new timestamped directory. Pin the directory URL
  (`1795207104_9.1`), never the `redirect/latest` URL.
- Trust limit (**Inference**, high): the `.sha256` file is served from the same host as the zip, so
  it guards against corruption and a changed file at that path, not against a compromise of the
  host itself. The site states the zip binaries are signed (the `.pkg` installers are also
  notarized); checking the binary's `codesign` identity at staging is the independent check. The
  Developer ID team was not verified in this pass.

### 10.2 Build configuration and licence

Source: https://ffmpeg.martin-riedl.de/download/macos/arm64/1795207104_9.1/versions.txt (**Verified**,
publisher's own `ffmpeg -version` capture; the binary itself was not run).

- Banner: `ffmpeg version 9.1-https://www.martin-riedl.de`, built with Apple clang 14.0.0.
- `configuration:` contains `--enable-version3 --enable-gpl` and does **not** contain
  `--enable-nonfree`. Full flag list: `--enable-gray --enable-libxml2 --enable-version3
  --enable-gpl --enable-openssl --enable-libfreetype --enable-fontconfig --enable-libharfbuzz
  --enable-libbluray --enable-libsnappy --enable-libsrt --enable-libvmaf --enable-libass
  --enable-libklvanc --enable-libzimg --enable-libzvbi --enable-libaom --enable-libdav1d
  --enable-libopenh264 --enable-libopenjpeg --enable-librav1e --enable-libsvtav1 --enable-libvpx
  --enable-libvvenc --enable-libwebp --enable-libx264 --enable-libx265 --enable-libmp3lame
  --enable-libopus --enable-libvorbis --enable-libtheora`. `--enable-decklink` is absent, so the
  Blackmagic SDK listed on the home page is not in this binary.
- Licence: **GPL-3.0-or-later**. **Verified** in FFmpeg's `configure` at tag `n9.1`
  (https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.1/configure): `enabled version3 && { enabled
  gpl && enable gplv3 ...}` and then `license="GPL version 3 or later"` for `gplv3`. The same file
  makes OpenSSL >= 3.0.0 with `--enable-gpl` require `--enable-version3` (else configure dies with
  "OpenSSL >=3.0.0 requires --enable-version3"), which this build satisfies. Note: `LICENSE.md` at
  `n9.1` still says OpenSSL is "incompatible with the GPLv2 and v3"; `configure` is the operative
  rule and the doc text is stale upstream (**Inference**, high). `FFMPEG_SOURCE_LICENCE =
  'GPL-3.0-or-later'` in `pins.mjs` is therefore correct.
- Bundled library versions as published in `versions.txt`: aom 3.15.3, libass 0.17.5,
  libbluray 1.5.0, dav1d 1.5.4, fontconfig 2.17.1, freetype 2.13.0, fribidi 1.0.18, harfbuzz
  14.4.0, libklvanc 1.7.0, lame 4.0, openh264 2.6.0, openJPEG 2.5.4, openssl 3.6.5, opus 1.6.1,
  rav1e 0.8.1, sdl 2.32.10 (ffplay only), snappy 1.2.2, srt 1.5.7, svt-av1 4.2.0, libtheora 1.2.0,
  libvmaf 3.2.1, libvorbis 1.3.7, vpx 1.17.0, vvenc 1.14.0, libwebp 1.6.0, **x264 0.165.x**,
  x265 4.2, libxml2 2.15.4, zimg 3.0.6, zlib 1.3.2, zvbi 0.2.35. libiconv and libogg are built by
  the script but not listed there.
- Still to confirm on the binary at staging (unchanged from section 8): `ffmpeg -version`,
  `ffmpeg -L` (must print GPL v3), `otool -L` (system libraries only).

### 10.3 Corresponding source for this exact build

**Publisher's offer.** **Verified**: the site offers no source bundle. It points to the build script
at https://git.martin-riedl.de/ffmpeg/build-script (Forgejo; `LICENSE` is Apache License 2.0;
README: "The `main` branch contains the latest stable script used for release builds"). The
repository has **no tags and no releases** (API `tags` empty, `release_counter: 0`), so no revision
is marked as the one that produced `1795207104_9.1`. The tip of `main` is
`78d7b7d9ff77fe8442c727636c0386a8a23b6adf`, "ffmpeg update (version 9.1)", 2026-11-20 19:15 +01:00,
about two hours before the build. **Inference**, medium-high: that commit is the build's script.

What the script does (**Verified** at that commit):

- FFmpeg: `https://ffmpeg.org/releases/ffmpeg-9.1.tar.bz2` (`version/ffmpeg` = `9.1`), configured as
  in 10.2.
- Most libraries: a release tarball at the version in `version/<name>` (for example `x265` = `4.2`,
  `openssl` = `3.6.5`), fetched with `curl -L -f`. **No checksum is checked on any download.**
- **x264: `https://code.videolan.org/videolan/x264/-/archive/master/x264-master.tar.gz`**, the
  moving `master` branch, with no version file. The exact x264 revision in the binary is therefore
  **not recorded anywhere published**. It can be recovered from the binary (libx264 writes its
  `core 165 r<rev> <hash>` string into every encoded stream) at staging, or asked of the publisher.
- rav1e: the GitHub tag tarball `v0.8.1`, built with `cargo cinstall`, which pulls Rust crates from
  crates.io at build time. Those crates are statically linked and are part of the corresponding
  source (**Inference**, high); they can be pinned from the tarball's `Cargo.lock` with
  `cargo vendor`.

**Official FFmpeg 9.1 tarball** (**Verified**, https://ffmpeg.org/releases/ and
https://ffmpeg.org/download.html, "9.1 was released on 2026-11-20"):

| File | Bytes (HEAD) | Signature |
|---|---|---|
| `ffmpeg-9.1.tar.bz2` (what the build used) | 15,036,306 | `ffmpeg-9.1.tar.bz2.asc` (520 bytes), also `.pq.asc` |
| `ffmpeg-9.1.tar.xz` | 12,557,532 | `ffmpeg-9.1.tar.xz.asc`, `.pq.asc` |
| `ffmpeg-9.1.tar.gz` | 18,894,852 | `ffmpeg-9.1.tar.gz.asc`, `.pq.asc` |

- ffmpeg.org publishes **no SHA-256** for releases (`ffmpeg-9.1.tar.bz2.sha256` and `.tar.xz.sha256`
  are 404). Integrity comes from the OpenPGP signature; the `.tar.bz2.asc` issuer fingerprint is
  `FCF986EA15E6E293A5644F10B4322F04D67658D8`, the key ffmpeg.org's download page shows in its
  verification example (key at https://ffmpeg.org/ffmpeg-devel.asc). The SHA-256 to pin must be
  computed locally **after** `gpg --verify` succeeds; it is not given here.
- Git tag `n9.1` → tag object `9d106a4c5a139fac2a62c349817017191217a9d8`
  (https://api.github.com/repos/FFmpeg/FFmpeg/git/ref/tags/n9.1, GitHub mirror).

**Is the official tarball alone the complete corresponding source?** No. The binary statically links
about thirty third-party libraries, x264 and x265 (GPL-2.0-or-later) among them. GPL v3 section 1
defines Corresponding Source as all the source needed to generate, install and run the object code,
including the scripts that control those activities, minus System Libraries. A compliant archive
for this binary needs (summary of the licence terms, not legal advice):

1. `ffmpeg-9.1.tar.bz2` and its `.asc`.
2. The source of every statically linked library at the built version: the 30 listed in 10.2 plus
   libiconv and libogg; for x264 the exact revision (see above); for rav1e its vendored crates.
3. The build script at the revision used (`78d7b7d9…`, with its Apache-2.0 `LICENSE`) and the
   exact `configure` line, so the archive can rebuild the binary.
4. A short README naming the binary's SHA-256 and the mapping from each source to its role.
   Apple's SDK and system libraries are excluded as System Libraries. Build tools (nasm, cmake,
   ninja, pkg-config) are general-purpose tools and not required (**Inference**, medium); bundling
   them is harmless.

The gap that blocks option (a) below today is item 2 for x264: until the revision is recovered and
its source archived, the bundle cannot be called complete.

### 10.4 Licence text members inside the FFmpeg source tarball

**Verified**: the top-level directory of the 9.1 release tarballs is `ffmpeg-9.1/` (first tar header
of `ffmpeg-9.1.tar.gz`, 64 KiB range read; the `.tar.bz2` is produced the same way and the build
script unpacks it with `--strip-components=1`, **Inference**, high). **Verified** at tag `n9.1`
(GitHub contents API): the licence files at the tree root and their sizes.

| Member path | Bytes at `n9.1` | Needed for this build |
|---|---|---|
| `ffmpeg-9.1/COPYING.GPLv3` | 35,147 | Yes, the operative licence |
| `ffmpeg-9.1/LICENSE.md` | 4,352 | Yes, explains which licence applies and lists GPL libraries |
| `ffmpeg-9.1/COPYING.LGPLv3` | 7,651 | Recommended (LGPL v3 parts; LGPL v3 is GPL v3 plus permissions) |
| `ffmpeg-9.1/COPYING.GPLv2` | 18,092 | Recommended (x264 and x265 are GPL-2.0-or-later) |
| `ffmpeg-9.1/COPYING.LGPLv2.1` | 26,517 | Optional (referenced by `LICENSE.md`) |

The bundled libraries' own licence files (for example `x265_4.2/COPYING`, OpenSSL `LICENSE.txt`)
live in each library's tarball, not in FFmpeg's; section 5.2 duty 1 still requires them in
`runtime/licenses/ffmpeg/`. Their member paths depend on the option chosen below and are not
pinned here.

### 10.5 Options

**(a) Keep the Martin Riedl build and assemble a source bundle.**
For: smallest change, binaries are signed and published with checksums, pins 10.1 are ready.
Against: x264 revision unrecorded, no checksums in the script, single third-party maintainer, the
bundle is our reconstruction of someone else's build and cannot be proven to match.

**(b) Switch to another well-known static arm64 build.**
For: evermeet.cx is Intel-only (5.1); jellyfin-ffmpeg publishes a
`jellyfin-ffmpeg_8.1.3-2_portable_macarm64-gpl.tar.xz` (32,904,768 bytes, release v8.1.3-2,
2026-11-03, **Verified** via the GitHub releases API) from a public GitHub repository.
Against: it is a patched FFmpeg 8.1.3 fork, not 9.1, and its source offer and library pinning were
**not assessed** in this pass; it changes the vetted candidate and needs its own vetting.

**(c) Build ffmpeg in CI from pinned sources.**
For: the archive of exactly the inputs the job consumed *is* the corresponding source; every input
gets a pin and checksum (FFmpeg via `gpg --verify`), x264 pinned to a commit; can reuse (fork) the
Apache-2.0 build script and drop unused libraries.
Against: long macOS arm64 CI job and its cache to maintain; signing and any notarization move to
us; the 10.1 zip pins become unused.

**Recommendation: (c)**, forking the Apache-2.0 build script with x264 pinned to a commit, checksum
verification on every download, a reduced library set (the studio needs x264, x265, LAME, opus
and the decoders, not decklink-era extras), and the job emitting both the binaries and the
source archive. If a release must ship before (c) exists, use (a) only after recovering the x264
revision from the binary and archiving that x264 source; otherwise the release is not compliant.

### 10.6 Proposed pin values

| Constant | Proposed value | Source | Confidence |
|---|---|---|---|
| `FFMPEG_ZIP.sha256` | `1f66e9a690a7f1c9e60b012379f8869c11818d1797f45b21dbb2f2564ba61ae1` | `.../1795207104_9.1/ffmpeg.zip.sha256` | High that it is the publisher's value; same-origin trust only |
| `FFPROBE_ZIP.sha256` | `6ef2df5f575042923a28537ab37adf936f28bf3e7b85de23a1447ed447ec1dbd` | `.../1795207104_9.1/ffprobe.zip.sha256` | Same |
| `FFMPEG_ZIP.bytes` / `FFPROBE_ZIP.bytes` | unchanged, 28,623,086 / 28,541,295 | HEAD 2026-11-23 | High |
| `FFMPEG_SOURCE_ARCHIVE` | stays `null`: the archive is a project-built release asset, so its URL, size and SHA-256 exist only after the owner chooses (a) or (c) and the archive is produced | 10.3 | n/a |
| upstream input (new pin, suggested) | `https://ffmpeg.org/releases/ffmpeg-9.1.tar.bz2`, `ffmpeg-9.1.tar.bz2`, 15,036,306 bytes, SHA-256 **unknown** until computed after `gpg --verify` | ffmpeg.org/releases | URL and size high; checksum not published |
| `FFMPEG_LICENCE_MEMBERS` | `['ffmpeg-9.1/COPYING.GPLv3', 'ffmpeg-9.1/LICENSE.md', 'ffmpeg-9.1/COPYING.LGPLv3', 'ffmpeg-9.1/COPYING.GPLv2', 'ffmpeg-9.1/COPYING.LGPLv2.1']`, read from the upstream FFmpeg tarball | tag `n9.1` + tarball header | High |
| `FFMPEG_SOURCE_LICENCE` | unchanged, `GPL-3.0-or-later` | `configure` at `n9.1`, `versions.txt` | High |

Owner decisions: (1) option (a), (b) or (c); (2) whether the same-origin `.sha256` is acceptable as
the zip pin for (a); (3) where the corresponding-source archive is hosted (its host is not in
`ALLOWED_DOWNLOAD_HOSTS` today); (4) whether `FFMPEG_LICENCE_MEMBERS` should be read from the
upstream FFmpeg tarball (a separate pin) rather than from `FFMPEG_SOURCE_ARCHIVE`, which `pins.mjs`
currently assumes.

Sources for this section (accessed 2026-11-23):

- https://ffmpeg.martin-riedl.de/
- https://ffmpeg.martin-riedl.de/download/macos/arm64/1795207104_9.1/ffmpeg.zip.sha256
- https://ffmpeg.martin-riedl.de/download/macos/arm64/1795207104_9.1/ffprobe.zip.sha256
- https://ffmpeg.martin-riedl.de/download/macos/arm64/1795207104_9.1/versions.txt
- https://ffmpeg.martin-riedl.de/info/history/macos/arm64/release
- https://git.martin-riedl.de/ffmpeg/build-script (and its Forgejo API: repository, tags, commits,
  `version/`, `script/build-x264.sh`, `script/build-ffmpeg.sh`, `script/build-rav1e.sh`, `LICENSE`)
- https://ffmpeg.org/releases/ (ffmpeg-9.1 tarballs and `.asc` files)
- https://ffmpeg.org/download.html
- https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.1/LICENSE.md
- https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.1/configure
- https://api.github.com/repos/FFmpeg/FFmpeg/contents?ref=n9.1
- https://api.github.com/repos/jellyfin/jellyfin-ffmpeg/releases
