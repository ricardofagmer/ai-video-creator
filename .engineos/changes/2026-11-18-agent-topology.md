---
domain: llm
risk: medium
spec: docs/specs/0001-agent-topology.md
security_review: not-required
---

# Agent topology for Video Studio R1

## What
Designed the R1 multi-agent topology through the 12-step /engineos:design-agents interview:
typed-pipeline + evaluator-optimizer, five agents (Planner, Scriptwriter, Scene director,
Reviewer, Recovery), four read-only tools, engine-assembled zod packets, no agent memory,
numeric harness bounds, fail-closed guards, failure policy, tracing and eval plan.

## Why
PRD 0001 section 9 and ADR 0002 require an approved topology (HITL reason `topology-approval`)
before any multi-agent workflow, agent or tool code (acceptance criterion 26).

## Scope
In: `docs/specs/0001-agent-topology.md` (v1). Out: any implementation file; Curator (R2);
an AI researcher (amendment if ever needed).

## What was made
- Wrote the topology spec v1 with all 12 sections and both Mermaid diagrams.
- Closed the research/verify gap: deterministic toolbox stages in R1.

## Not done
- No implementation; evals are plans only (authored at the approved final stage).

## Checklist
- [x] All 12 sections hold owner decisions; no placeholders
- [x] `pattern_ids` matches §1
- [x] §3 has all eight decisions for every tool
- [x] §5 has packet and output models for every §2 agent
- [x] No agent, workflow or tool implementation written during the interview

## User checklist
- [ ] Review the two diagrams in §12 rendered in a Markdown viewer; reopen any step if they do not match intent
- [ ] Accept ADRs 0001-0003 (status still `proposed`)

## Human decisions
2026-11-18 | Ricardo Fagmer | topology-approval | approved | docs/specs/0001-agent-topology.md
