# 06-purpose-agent-tools: Agents see the purpose

**What to build:** `CatalogSearchTool` rows and `AssetDescribeTool` output include `purpose`, bounded and redacted like `summary`. Biometric rows stay excluded.

**Blocked by:** 01-purpose-tracer-bullet

**Status:** ready

## Requirements
- AP-14

## Technical details
- Add `purpose` to both output schemas, bounded by a new `purposeMaxChars` (280) and passed through the same `redactJson` call as `summary`.
- Update the tool descriptions so agents know the field exists. The biometric guards stay as they are.

## Acceptance criteria
- [ ] AP-14 as written in the plan.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected requester and model client.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in a production path.
- [ ] No edit outside the exclusive paths, and no edit to the PRD, ADR 0012, the plan or the ticket files.
- [ ] No check, build, test, migration run, install or git write was run by this ticket. Review evidence comes from inspection.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/agents/tools/catalog-search.tool.ts`, `packages/core/src/agents/tools/asset-describe.tool.ts`, `packages/core/src/agents/tools/tool-results.ts`, `packages/shared/src/agents/tool-limits.ts`
- dependsOn: 01-purpose-tracer-bullet
- Owner: llm-coordinator
- Risk / autonomy: high / A2 (working tree only)
- Acceptance ids: AP-14
- Contracts: `.specs/features/catalog-asset-purpose/plan.md` rev 1 (C-P1..C-P6), `docs/adr/0012-asset-purpose-text.md`, `docs/prds/2026-11-25-catalog-asset-purpose.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contracts
