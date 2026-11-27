# desktop-installer: proposed final evidence

Status: rev 2, follows frozen `plan.md` rev 3. This is a plan. No test is written or run
before the final checkpoint and the recorded `test-ready` answer (rules/verification.md).

| Acceptance | Proposed evidence | Kind |
|---|---|---|
| DI-AC-01 | Owner run on a Mac user account with no Homebrew on PATH: open the `.dmg`, complete setup, studio opens. Screen recording or step log. | owner-run |
| DI-AC-02 | Run setup twice; second run's step log shows every step "already done"; data home file hashes unchanged. | owner-run + script |
| DI-AC-03 | Unit tests of the runtime locator; `ps` and `lsof` of studio processes show executables only under the app bundle. | unit + inspection |
| DI-AC-04 | Setup with both optional downloads refused; status shows `not-installed` for both and `setup: complete`. | integration |
| DI-AC-05 | Install build N, create a catalog item, install build N+1; item, passphrase login and keys still work. | owner-run |
| DI-AC-06 | Uninstall; `launchctl print` shows no agent, app gone, data home present. | owner-run |
| DI-AC-07, 13 | Schema tests: response parsed with a strict Zod schema; a test fails on any extra key; payloads scanned for `/Users/`, the user name and known secret patterns in every component state. | unit |
| DI-AC-08 | Api integration test: allowed origin gets the allow header, another origin and a non-install route get none. | integration |
| DI-AC-09 | Api integration test with a forged `Host`: 421. | integration |
| DI-AC-10, 11, 12 | Api integration tests: no token, wrong token, reused code, expired code, sixth failed attempt. | integration |
| DI-AC-14 | Existing listener assertion in `main.ts` kept; test that binds and reads the address. | unit |
| DI-AC-15, 16, 17, 18 | Browser walk of the portal against a local api in the four states (absent, unpaired, paired healthy, paired with watcher stopped) and with loopback blocked; screenshots, console and network logs. | browser (qa-tester) |
| DI-AC-19 | A tag on a test repository or a `workflow_dispatch` dry run: assets, checksum and manifest present; portal shows the same checksum. | CI run, owner-approved |
| DI-AC-20 | `codesign --verify --deep --strict` and fuse read-back on the built app. | script |
| DI-AC-21 | Network log of the portal session: no request to a non-loopback host carries status fields. | browser |
| DI-AC-22 | Phase 2 plan; verified on a real Windows machine. | owner-run |

Existing commands that would be proposed at the final checkpoint (none run before approval):
`pnpm exec turbo run typecheck --filter='@studio/*'`, `pnpm exec turbo run lint --filter='@studio/*'`,
`pnpm exec turbo run test --filter='@studio/*'`, `pnpm exec turbo run build`.

Independent reviews recorded for the final gate: `security-reviewer` (new cross-origin
surface, token handling, release workflow permissions) and `critic` (risk high).

## Rev 3 additions

| Acceptance | Proposed evidence | Kind |
|---|---|---|
| DI-AC-23 | Start the packaged web and read its listening address; a request to the machine's LAN address is refused. | script |
| DI-AC-24 | Unit test of the path-stability rule; owner run opening the app straight from the mounted `.dmg`. | unit + owner-run |
| DI-AC-25 | Release dry run lists the source archive and `latest.json.sources`; the app's `licenses/ffmpeg/` holds the GPL text. | CI dry run + inspection |
| DI-AC-26 | Api integration test of `OPTIONS` for the portal origin and for another origin. | integration |
