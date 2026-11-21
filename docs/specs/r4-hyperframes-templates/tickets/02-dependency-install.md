# 02-dependency-install: Add `hyperframes` 0.9.72 exact to one package (owner-approved install) (R4H-02)

**What to build:** The new workspace package `@studio/hyperframes` exists with the pinned dependency, the lockfile holds exactly that version, and the install is recorded with its review.

**Blocked by:** **owner-run step O1**: the owner's explicit approval of this install (the pin itself was approved on 2026-11-20, `docs/vetting/0005-hyperframes-dependency.md`)

**Status:** blocked (waits for the owner's approval)

## Requirements
- AC 64
- AC 65 (SPEC 0008 section 8; PRD 0001 R4 goal 5 through SPEC 0008 section 11)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md K1, K2, U8. Create `packages/hyperframes/package.json` (`name: "@studio/hyperframes"`, private, `dependencies: { "hyperframes": "0.9.72", "@studio/shared": "workspace:*" }`, the same `build` and `typecheck` scripts as the other packages), its `tsconfig` files and an empty `src/index.ts`. Add `"@studio/hyperframes": "workspace:*"` to `apps/watcher/package.json` and `tools/cli/package.json` (that one line each). Then, as the single install of this spec and only after O1: `pnpm install` at the repository root; review the `pnpm-lock.yaml` diff against the tree of vetting 0005 section 4 (75 packages, `hyperframes` 0.9.72, integrity beginning `sha512-c7dC2WL0`, every entry from `registry.npmjs.org`, only darwin-arm64 optional packages built); run `npm audit signatures`. If npm cannot read the pnpm tree, use the U8 fallback: in an empty folder under the session scratchpad, `npm install hyperframes@0.9.72 --ignore-scripts`, then `npm audit signatures`, then compare every integrity value with the pnpm lockfile. `pnpm-workspace.yaml` is not edited: `esbuild` is already on `onlyBuiltDependencies`.

## Acceptance criteria
- [ ] `hyperframes` is named in exactly one manifest, as `"0.9.72"` with no `^`, `~` or range (AC 64).
- [ ] The lockfile holds one `hyperframes` version; no package it adds needs a new `onlyBuiltDependencies` entry; `sharp` resolves to its prebuilt darwin-arm64 packages with no script (AC 65).
- [ ] The install record (in the change record) holds: the owner's approval, the lockfile diff summary with any package not in the vetting 0005 tree named and explained, and the `npm audit signatures` output with zero invalid or missing signatures.
- [ ] A lockfile entry that differs from the vetted tree in a way nobody can explain stops the ticket as `BLOCKED`; nothing is "fixed" with `audit --fix` or a range.

## Testing requirements
None. This ticket runs exactly two commands, both named above and both inside the owner's approval: `pnpm install` and `npm audit signatures` (or its U8 fallback). No build, no test, no render, no `npx`, no `hyperframes` process.

## Definition of Done
- [ ] No source code beyond the empty `src/index.ts`; no `hyperframes` binary was started.
- [ ] No edit outside the exclusive paths; no edit to `pnpm-workspace.yaml`, the PRD, SPEC 0008 or the ticket files.
- [ ] No git write was made by this ticket; the supervisor proposes the commit under `rules/git.md`.

## EngineOS brief metadata
- Exclusive paths: `packages/hyperframes/package.json`, `packages/hyperframes/tsconfig*.json`, `packages/hyperframes/src/index.ts`, the `@studio/hyperframes` line in `apps/watcher/package.json` and `tools/cli/package.json`, `pnpm-lock.yaml`
- dependsOn: none (owner approval O1)
- Owner: devops-coordinator
- Risk / autonomy: medium / A3: the install is an external effect (registry download) and runs only after the owner's recorded approval
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` (frozen revision), `docs/vetting/0005-hyperframes-dependency.md`, ADR 0001 (install-script allowlist)
