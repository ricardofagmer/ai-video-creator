# 0011. Add the installed Claude Code CLI as a third engine for the studio's agents

Date: 2026-11-23
Status: proposed (owner approval pending).

Decider: Ricardo Fagmer. Sources: the owner's request and answers of 2026-11-23 (recorded in
`.engineos/changes/2026-11-23-claude-code-engine.md` under Human decisions); ADR 0002; the code
read at `0060c10` plus the uncommitted working tree; one proof call run on 2026-11-23.

Amends ADR 0002. It does not replace it: the mock and Claude API engines stay.

## Context

- ADR 0002 runs the five agents (planner, scriptwriter, scene director, reviewer, recovery) as
  Mastra agents on the Claude API. The API is billed per token, on top of the owner's Claude
  subscription. The owner finds that too expensive and wants the Claude Code installed on the Mac
  to do the work (2026-11-23).
- ADR 0002 rejected Claude Code sessions for three reasons: (1) tool control was coarse (skip all
  permissions, then deny), so a session had a shell and the filesystem; (2) runs had to continue
  with no Claude Code session open; (3) cost had to be reported per agent session.
- The agents already sit behind one seam: `ClaudeAdapter.generate(call)` in
  `packages/core/src/agents/adapters/claude-adapter.ts`, with a mock and a live implementation
  chosen in `AgentsService.run` (**Fact**).
- Claude Code 2.1.329 is installed at `~/.local/bin/claude` and signed in with an organization
  account, Instituto Biosistemico (**Fact**, observed in the CLI's own message).

### Proof call (2026-11-23)

One call with the real planner system prompt (`planner@2`) and the real `PlanOutputSchema`:

```
claude -p --output-format json --json-schema <schema> --tools "" --system-prompt <planner system>
       --model sonnet --strict-mcp-config --setting-sources ""      (packet on stdin)
```

Observed (**Fact**):

- Exit 0 in 8.3 s, model `claude-sonnet-5-5`, 2 turns, no tool available to the model.
- The answer arrived in the envelope's `structured_output` field and passed
  `PlanOutputSchema.safeParse` unchanged.
- The envelope carries `usage` (input, output, cache read and cache write tokens) and
  `total_cost_usd` (0.0255 for this call).
- The JSON Schema from `z.toJSONSchema` is rejected while it carries its `$schema` key; without
  the key it is accepted.
- Inside the Claude Code command sandbox the call fails at sign-in, because the sandbox blocks
  writes to `~/.claude`. Outside it the call works. The watcher does not run in that sandbox.

**Unverified:** that a subscription call adds nothing to any bill. `total_cost_usd` is reported
either way; the owner's plan page is the authority.

## Decision

1. **Third engine, behind a setting.** A new `ClaudeCodeAdapter` implements `ClaudeAdapter`. A new
   setting `ENGINEOS_VIDEO_CREATOR_CLAUDE_ENGINE` takes `api` (default) or `claude-code`. It is
   read only when the `claude` provider is `live`. Mock stays the default for every provider.
2. **No API key in this engine.** With `claude-code`, the `claude` provider needs no
   `anthropic-api-key`. The child process never receives `ANTHROPIC_API_KEY`, so a call can never
   fall through to the API bill without the owner choosing `api`.
3. **No tools, no shell.** Every call passes `--tools ""`, `--strict-mcp-config` and
   `--setting-sources ""`. The model has no built-in tool, no MCP server, and none of the owner's
   hooks, skills or `CLAUDE.md`. This removes ADR 0002's reason (1) instead of accepting it.
4. **Structured output by schema.** The role's C7 schema goes in `--json-schema` (without
   `$schema`). The service re-parses the answer with zod and runs the output scan exactly as for
   the other engines, including the one schema-feedback retry.
5. **One call, one process.** `spawn` with an argument array, never a shell. The prompt goes on
   stdin. The working directory is an empty folder. The call's abort signal kills the child, and
   the call's deadline bounds it. A rate limit or overload is classified into the existing
   `rate-limit` failure and follows the ADR 0002 retry ladder.
6. **Cost.** Tokens are recorded per call from the envelope's `usage`. USD is recorded as 0,
   because the subscription is not billed per call. The cost files keep their format.
7. **Egress.** The prompt still leaves the Mac for Anthropic, so the "what left the machine"
   record is written as in live API mode.
8. **Tool roles, first cut.** The scene director, reviewer and recovery roles have read-only typed
   tools in the API engine. In this engine's first cut they run without tools and work from their
   packet alone. Serving the same typed tools to Claude Code through a local MCP server is a
   later, separate change.
9. **Unattended runs.** The watcher starts the calls, so a run continues with the web, the CLI
   and every interactive Claude Code session closed. This keeps ADR 0002's reason (2). It needs
   Claude Code installed and signed in on the Mac.

## Alternatives considered

| # | Alternative | Why not |
|---|---|---|
| A | Keep the Claude API only (ADR 0002 as is) | A second bill per token, which is the owner's objection. |
| B | Replace the API with Claude Code | No way back without rework; loses per-call USD; the owner chose to keep both. |
| C | Full Claude Code sessions with built-in tools and skills (`ai-creator-engine` ADR 0002) | Gives the model a shell and the filesystem, which PRD section 12 forbids; output is not schema-bound. |
| D | The Claude Agent SDK in process | A new dependency to vet for the same result as one CLI call; the CLI is already installed and proven. |
| E | A local MCP server for the typed tools now | Needed for full parity, but it doubles the first cut. Deferred, see decision 8. |

## Consequences

- No per-token bill for agent calls in this engine. Runs share the subscription's usage limits
  with the owner's interactive work; a long run can hit them.
- The account is an organization account. Runs count against that organization's plan and follow
  its managed policy. **Owner to confirm** this use is acceptable there.
- Cost reports show 0 USD for these calls. Tokens remain, so the two engines can be compared.
- Scene direction and review are weaker than in the API engine until the tools arrive
  (decision 8): the director cannot search the catalog or sample frames.
- The packaged app (ADR 0010) cannot carry Claude Code. A user of this engine installs and signs
  in to Claude Code separately; setup and `doctor` should check for it. Not part of this change.
- Reversal is one setting: `ENGINEOS_VIDEO_CREATOR_CLAUDE_ENGINE=api`, or `claude` back to mock.
