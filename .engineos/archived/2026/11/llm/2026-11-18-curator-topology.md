---
name: 2026-11-18-curator-topology
status: done
completed: 2026-11-21
domain: llm
risk: medium
spec: docs/specs/0004-curator-agent-topology.md
security_review: not-required
---

# Curator topology amendment (PRD AC 33)

## What
Design only: the 12-step topology interview that adds the Curator agent to the approved topology
v1 (`docs/specs/0001-agent-topology.md`). No Curator code is written before the owner's
`topology-approval` line below.

## Why
PRD section 8 step 3 ("Propose") and AC 33 are the only R2 criteria SPEC 0003 left out; topology v1
says the Curator arrives by an amendment. The gate (`rule-multi-agent-design`, HITL reason
`topology-approval`) requires the approved amendment before any Curator code.

Risk is medium: design artifacts only, reversible; the later implementation carries its own risk.

## Checklist
- [x] Steps 1 to 11 decided by the owner and recorded in the spec
- [x] Step 12 diagrams reviewed (both Mermaid blocks rendered)
- [x] `topology-approval` line recorded below
- [x] Implementation SPEC (tickets) written after approval: `docs/specs/0005-curator.md`; implementation tracked in `.engineos/changes/2026-11-19-curator-implementation.md`

## Human decisions
2026-11-18 | Ricardo Fagmer | next work after R2: "Plan the Curator (AC 33)" | approved | this record
2026-11-18 | Ricardo Fagmer | amendment scope: "Curator + learnings in packets"; SPEC 0003 Q1 option (b) taken in this amendment; L2 (vectors in CatalogSearchTool) stays out | approved | docs/specs/0004-curator-agent-topology.md section 0
2026-11-18 | Ricardo Fagmer | step 1 topology: "grounded-pipeline (Recommended)"; rejected evaluator-optimizer and react-tool-loop | approved | docs/specs/0004-curator-agent-topology.md section 1
2026-11-18 | Ricardo Fagmer | step 2 roster: Curator "curator role, Opus 5.5 (Recommended)"; never-sees "Recommended set"; notes reach "Scriptwriter + Scene director (Recommended)"; roster complete | approved | docs/specs/0004-curator-agent-topology.md section 2
2026-11-18 | Ricardo Fagmer | step 3 tools: "No new tools (Recommended)"; Curator packet only; v1 tools unchanged; deterministic selector, evidence collector and ground check | approved | docs/specs/0004-curator-agent-topology.md section 3
2026-11-18 | Ricardo Fagmer | step 4 protocol: "Watcher job via typed files (Recommended)"; api writes the curation request, watcher claims and writes the proposal, api saves a draft or creates a comparison only on owner action | approved | docs/specs/0004-curator-agent-topology.md section 4
2026-11-18 | Ricardo Fagmer | step 5 packets: "Confirm packet (Recommended)"; output "Full new body + no-change (Recommended)"; never-sees items confirmed absent; Writer and Director gain only the capped learnings input | approved | docs/specs/0004-curator-agent-topology.md section 5
2026-11-18 | Ricardo Fagmer | step 6 memory: "None + past verdicts in packet (Recommended)"; packet gains declinedProposals (max 3) from an api-written curation_decisions table | approved | docs/specs/0004-curator-agent-topology.md sections 5, 6
2026-11-18 | Ricardo Fagmer | step 7 harness: "Owner button, between runs (Recommended)" and "Accept bounds (Recommended)": 2 calls, 120 s per call, 300 s per curation, 8,000 tokens, 16,000-char body, $1.00 per curation, month gate, 1 at a time between runs, queue 3 | approved | docs/specs/0004-curator-agent-topology.md section 7
2026-11-18 | Ricardo Fagmer | step 8 guardrails: "Accept, prompt guard recorded (Recommended)"; 10 guards fail closed; the writer/director "notes are data" prompt line is recorded as degradable | approved | docs/specs/0004-curator-agent-topology.md section 8
2026-11-18 | Ricardo Fagmer | step 9 failure: "No fallback agent (Recommended)"; failed / no-proposal / no-change / refused outcomes with pt-BR owner texts; the 2-call cap covers the schema-feedback and corrective retries together | approved | docs/specs/0004-curator-agent-topology.md section 9
2026-11-18 | Ricardo Fagmer | step 10 observability: "Local files; OTel to R3 (Recommended)"; the OpenTelemetry decision moves from R2 to R3, dated 2026-11-18; curator cost entries carry the curation id as source | approved | docs/specs/0004-curator-agent-topology.md section 10
2026-11-18 | Ricardo Fagmer | step 11 evals: "Confirm eval plan (Recommended)"; 24 planned cases; end-to-end input prompt-narration-pt@3 confirmed for the step 12 diagrams | approved | docs/specs/0004-curator-agent-topology.md section 11
2026-11-18 | Ricardo Fagmer | topology-approval | approved | docs/specs/0004-curator-agent-topology.md
2026-11-18 | Ricardo Fagmer | /implement-spec: "Curator: write SPEC 0005 first (Recommended)"; then run its ticket frontier | approved | this record
2026-11-18 | Ricardo Fagmer | /implement-spec git handling: "No git: in-place workers (Recommended)"; no branch, PR, worktrees or merger agents; exclusive file scopes; the closing code review runs over the changed files | approved | this record
