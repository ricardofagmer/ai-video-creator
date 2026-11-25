# 07-final-proof: Final evidence for catalog asset purpose

**What to build:** The evidence in `.specs/features/catalog-asset-purpose/checks.md`: tests for AP-01..AP-14, lint, typecheck and build, a browser walk, and the security review.

**Blocked by:** 01-purpose-tracer-bullet, 02-purpose-content-readers, 03-purpose-owner-edit, 04-purpose-hover-and-copy, 05-purpose-backfill, 06-purpose-agent-tools

**Status:** blocked

## Rules
Outside the implementation graph. It starts only after every implementation ticket has integrated and the owner has given final-checkpoint approval (rules/verification.md). The security review needs its own consent. The migration runs only on a disposable database inside an approved test command.

## EngineOS brief metadata
- Owner: test-writer, qa-tester (done-gate browser mode), security-reviewer
- Contracts: `.specs/features/catalog-asset-purpose/plan.md` rev 1 (C-P1..C-P6), `docs/adr/0012-asset-purpose-text.md`, `docs/prds/2026-11-25-catalog-asset-purpose.md`
- Results go to `.specs/features/catalog-asset-purpose/verification.md`
