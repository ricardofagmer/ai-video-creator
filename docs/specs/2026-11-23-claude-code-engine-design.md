# Claude Code engine: design and tickets

Date: 2026-11-23. Status: proposed (owner approval pending). Decision record: ADR 0011.
Change record: `.engineos/changes/2026-11-23-claude-code-engine.md`. Scope revision: `rev1`.

## Goal

A run started in the studio is planned, written and directed by the Claude Code installed on this
Mac, with no Claude API call, and the rendered video plays in the studio.

## Scope

In:

- A `claude-code` engine for the `claude` provider, chosen by a setting.
- A local test run with Claude Code for the agent stages and a real render.

Out:

- The typed tools for the director, reviewer and recovery roles (ADR 0011 decision 8).
- The installer, the portal, Windows, setup and `doctor` checks for Claude Code.
- Voice and capture, which stay mock in the test.
- Removing or changing the Claude API engine.

## Contracts (frozen for the tickets)

**C1. Setting.** `ENGINEOS_VIDEO_CREATOR_CLAUDE_ENGINE`: `api` (default) or `claude-code`. Any
other value fails the start with the variable's name, never its value. Read only when
`ENGINEOS_VIDEO_CREATOR_CLAUDE_MODE=live`. Optional `ENGINEOS_VIDEO_CREATOR_CLAUDE_BIN`: absolute
path of the CLI; absent, `claude` is resolved on `PATH`.

**C2. Credential rule.** `live` + `claude-code`: no `anthropic-api-key` is required or read. At
start, the CLI must resolve and answer `--version`; otherwise the start fails with a named error.

**C3. Command.** One process per model call:

```
<bin> -p --output-format json --json-schema <role schema, no $schema> --tools ""
      --system-prompt <role instructions> --model <model id>
      --strict-mcp-config --setting-sources ""
```

- stdin: `stablePrefix` (when present), a blank line, then `body`.
- `spawn` with an argument array, `shell: false`, working directory an empty folder.
- Environment: an allowlist (`PATH`, `HOME`, `USER`, `LANG`, `TMPDIR`). `ANTHROPIC_API_KEY` and
  every other `ANTHROPIC_*` variable are never passed.
- The call's `AbortSignal` kills the child. No call outlives its deadline.

**C4. Result.** The envelope is parsed with a zod schema: `is_error`, `subtype`,
`structured_output`, `usage`, `modelUsage`. The adapter returns `structured_output` (or
`undefined`), unvalidated, as `ClaudeAdapter` requires. `usage` reaches `hooks.afterModelCall` in
the raw Anthropic shape the usage mapper already reads.

**C5. Failures.** A non-zero exit, an error envelope or unparsable output becomes a
`ProviderCallError`: sign-in failures map to `authentication` (not retried), rate limit, usage
limit and overload to `rate-limit` (ADR 0002 ladder), the rest to `transient`. stderr is never
copied into a run file unredacted.

**C6. Cost.** USD 0 per call in this engine; tokens recorded. `cost.json` keeps its schema.

## Tickets

Each ticket names its files. Tickets 1 and 2 are independent; 3 needs both; 4 needs 3.

1. **Engine setting and credential rule** (C1, C2).
   `packages/core/src/providers/` (settings, mode service, credentials, errors).
   Done when: `api` behaves as today; `claude-code` starts with no API key and fails the start
   when the CLI is missing.
2. **CLI runner and adapter** (C3, C4, C5).
   New files under `packages/core/src/agents/adapters/` (`claude-code.adapter.ts`,
   `claude-code-cli.ts`, `claude-code-envelope.ts`).
   Done when: given a `ModelCall`, the adapter returns the structured answer, reports usage, maps
   the three failure classes, and stops the child on abort.
3. **Wire the engine** (C6).
   `agents.module.ts`, `agents.service.ts`, `packages/core/src/costs/cost-ledger.service.ts`.
   Done when: `AgentsService.run` picks mock, API or Claude Code from the settings; start-up no
   longer asks for the key in this engine; the ledger prices these calls at 0.
4. **Final proof: a run from the studio.** No code. Start the api, watcher and web with
   `claude` live on `claude-code` and `render` live; start a run in the studio; confirm from the
   session files that every agent call used Claude Code; play the video in the studio.

Tests for tickets 1 to 3 are written and run only at the final gate, after your yes.

## Risks and checks

- **Tool roles without tools.** The director's prompt mentions tools it will not have. If its
  output fails the engine's ref re-check in ticket 4, the fix is a small prompt note for this
  engine, raised as a scope change, not slipped in.
- **Usage limits.** A run makes several calls; a limit pauses the run through the existing
  rate-limit path.
- **Organization account.** See ADR 0011 consequences; your confirmation is recorded in the
  change record.
- **Security.** New process spawn and a changed credential rule: a read-only security review is
  recorded as pending and offered at the final gate.

## Rollback

Unset `ENGINEOS_VIDEO_CREATOR_CLAUDE_ENGINE`, or set `claude` back to mock. No data migration.
