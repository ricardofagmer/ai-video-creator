# 08-runtime-sandbox-hardening: Runtime and profile: targeted denies, `-D` parameters, Chrome verify (R4H-08)

**What to build:** The render sandbox denies the routes the 2026-11-21 review named (M1) while keeping `(allow default)`, every path and port reaches it as a `-D` parameter, and `@studio/hyperframes` can verify the Chrome binary against `chrome.json` (L1).

**Blocked by:** none (the owner froze SPEC 0008 rev 2 on 2026-11-21)

**Status:** integrated (2026-11-21; profile matches 17.4 apart from comments)

## Requirements
- AC 86
- AC 87
- AC 88 (the `resolveExecutable` part)
- AC 90 (SPEC 0008 section 17.13; findings M1 and L1 of section 17.1)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 17.3 (K15, K16, K18), 17.4, 17.5, 17.6 and U9 to U14. Deliver in `packages/hyperframes/sandbox/render.sb` the profile text of section 17.4, each rule group with a comment giving its reason. Deliver in `packages/hyperframes/src/**`:

- `HyperframesRuntime` with the nine new fields; `HyperframesBaseRuntime` unchanged.
- `buildSandboxArgs` (new, pure) and `buildRenderArgv` (request gains `templateDir`; it is `buildSandboxArgs` plus node, the bin and the unchanged render flags). Seventeen `-D` pairs in the frozen order. Both throw `HyperframesSandboxUnavailableError` before a start for a relative path, a NUL or line break in a value, or a port outside 1024 to 65535.
- `renderPicture` passes its `templateDir` to `buildRenderArgv`; no other change.
- `resolveExecutable`, `realPathOfExistingPrefix` (Node only, read-only) and the export of `workspaceRoot`.
- `hashChromeBinary` and `verifyChromeBinary` as in section 17.6; `ChromeMissingDetail` gains `'changed'`.

Contract snippet (frozen in section 17.5):

```typescript
export function buildSandboxArgs(request: { templateDir: string; runtime: HyperframesRuntime }): readonly string[];
export function verifyChromeBinary(recorded: { executablePath: string; sha256: string; sizeBytes: number },
  options: { cacheDir: string }): Promise<void>;
```

Report, do not act on, anything in the profile you believe will not compile: the text is the starting point and changes only through the fallbacks of U9 to U14 after the owner's trace.

## Acceptance criteria
- [ ] `render.sb` holds `(allow default)`, the six rev 1 rules after it and every rev 2 group of section 17.4, ends with the `OWNER_HYPERFRAMES_DIR` deny, and contains no `/Users/`, no `4310`, no `4311`; its `(param "…")` names are exactly the seventeen of section 17.5 (AC 86).
- [ ] The argv is `-f <profile>`, the seventeen pairs in order, node, the pinned bin and the unchanged flags; each pair is one argument; the builders read no file and no `process.env` (AC 87).
- [ ] `resolveExecutable` returns a real path for an absolute setting and for the first executable regular file on the search path, and throws otherwise; it never starts the program (AC 88).
- [ ] `verifyChromeBinary` opens the path once with `O_NOFOLLOW`, requires the real path inside the real `cacheDir`, a regular file of the recorded size and the recorded sha-256, and throws `HyperframesChromeMissingError` otherwise (AC 90).
- [ ] `buildRenderEnv` and `buildBrowserEnsureArgv` have no diff: the environment keeps eleven keys and `browser ensure` stays unsandboxed and unchanged.

## Testing requirements
None in this ticket, and none in this wave (SPEC 0008 K17, owner decision OD8). Do not add or edit a test file: the existing tests under `apps/watcher/src/hyperframes-runtime/` will no longer match the argv and are updated by ticket 12. This ticket starts no process: not `sandbox-exec`, not Chrome, not `hyperframes`.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `shell: true`, no `process.env` read, no secret literal in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to `packages/hyperframes/package.json`, to a test file, to SPEC 0008 or to a ticket file.
- [ ] Errors carry reason ids and details only: no path, no hash, no child output (SPEC 0008 K12).
- [ ] No check, build, test, install, download, render or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `packages/hyperframes/src` (no `*.test.ts`), `packages/hyperframes/sandbox`
- dependsOn: none (the rev 1 tickets are integrated)
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` section 17 (rev 2, frozen 2026-11-21, with OD10 (a): the two Keychain names are in the 17.4 deny list), `docs/adr/0008-hyperframes-templates.md`
