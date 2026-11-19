import { createHash } from 'node:crypto';
import { type QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import {
  CatalogSearchInputSchema,
  ENVELOPE_PAGINATION_KEY,
  toolErrorHints,
  toolLimits,
  type CatalogSearchInput,
} from '@studio/shared/agents';
import { TagSchema, type AssetKind, type AssetVersion, type Tag } from '@studio/shared/catalog';
import { CatalogError, SearchAssetsQuery, type AssetVersionPage } from '../../catalog';
import { type RedactorService } from '../../redaction';
import { AgentRunError } from '../agents.errors';
import { toolFailure } from './tool-errors';
import { CatalogSearchEnvelopeSchema, CatalogRowSchema, type CatalogRow } from './tool-results';
import { type CatalogPage } from './tool-state';
import { type GuardedTool, type ToolCall, type ToolSuccess } from './tool-wrapper';

const TOOL = 'CatalogSearchTool';
const { resultMaxChars, summaryMaxChars } = toolLimits.catalogSearch;
/** C1/catalog keyset pages hold at most 100 rows. */
const MAX_FETCH_ROWS = 100;
const TITLE_MAX_CHARS = 200;

/** Construction binding (topology 3.2): from the run's pinned recipe version, never from the model. */
export interface CatalogSearchBinding {
  readonly allowedKinds: readonly AssetKind[];
  /** Curated `brandKit.tagHints` (topology 3.3); description only, never a filter. */
  readonly tagHints: readonly Tag[];
}

/** `p<page>.<keyset or 0>.<rows already shown from that keyset page>`; produced in `_pagination` only. */
const CURSOR_PATTERN = /^p([1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,14})\.([0-9]{1,2})$/;

interface SearchCursor {
  readonly page: number;
  readonly keyset: string | null;
  readonly skip: number;
}

function parseCursor(cursor: string | undefined): SearchCursor | null {
  if (cursor === undefined) return { page: 1, keyset: null, skip: 0 };
  const match = CURSOR_PATTERN.exec(cursor);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) return null;
  return { page: Number.parseInt(match[1], 10), keyset: match[2] === '0' ? null : match[2], skip: Number.parseInt(match[3], 10) };
}

function formatCursor(cursor: SearchCursor): string {
  return `p${cursor.page}.${cursor.keyset ?? '0'}.${cursor.skip}`;
}

const RedactedRowsSchema = z.array(
  z.object({
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.string()),
    license: z.object({ name: z.string() }).passthrough().nullable(),
  }),
);

function toRow(version: AssetVersion): CatalogRow {
  return {
    ref: `${version.id}@${version.version}`,
    kind: version.kind,
    title: version.name.slice(0, TITLE_MAX_CHARS),
    summary: version.summary.slice(0, summaryMaxChars),
    tags: [...version.tags],
    license: version.license === null ? null : { name: version.license.name, allowedUses: [...version.license.allowedUses] },
  };
}

/** Topology 3.2 fail-closed guards, applied again to every row the query returned. */
function passesGuards(version: AssetVersion, allowedKinds: readonly AssetKind[]): boolean {
  return version.status === 'active' && version.sensitivity !== 'biometric' && allowedKinds.includes(version.kind);
}

function describe(binding: CatalogSearchBinding): string {
  const hints = binding.tagHints.length === 0 ? '' : ` Useful tags for this brand: ${binding.tagHints.join(', ')}.`;
  return (
    'Find active catalog asset versions by kind, tag and text; returns previews (ref, kind, title, summary, tags, license), never files. ' +
    `Kinds this recipe allows: ${binding.allowedKinds.join(', ')}.${hints} ` +
    `Cite only refs returned here or offered in your packet. When ${ENVELOPE_PAGINATION_KEY} is present, pass its cursor for the next page.`
  );
}

export interface CatalogSearchDependencies {
  readonly queries: QueryBus;
  readonly redactor: RedactorService;
}

/**
 * CatalogSearchTool (topology 3.2): a lexical catalog query with `status = 'active'`,
 * `sensitivity != 'biometric'` and `kind IN recipe.allowedKinds` injected server-side, a
 * 4,000-character `_result` with overflow to a `_pagination` cursor, and a step-lived memo keyed
 * `runId::stageId::sha256(normalized input)`. Returned refs join the caller's `offeredRefs`.
 */
export function catalogSearchTool(
  dependencies: CatalogSearchDependencies,
  binding: CatalogSearchBinding,
): GuardedTool<CatalogSearchInput, CatalogRow[], AssetVersion[]> {
  async function fetchPage(input: CatalogSearchInput, kinds: readonly AssetKind[], cursor: SearchCursor): Promise<CatalogPage> {
    let page: AssetVersionPage;
    try {
      page = await dependencies.queries.execute(
        new SearchAssetsQuery({
          text: input.text,
          tags: input.tags,
          kinds: [...kinds],
          statuses: ['active'],
          sensitivity: 'exclude-biometric',
          limit: Math.min(MAX_FETCH_ROWS, cursor.skip + input.limit),
          cursor: cursor.keyset ?? undefined,
        }),
      );
    } catch (error) {
      if (error instanceof CatalogError && error.category === 'validation') throw toolFailure(TOOL, 'ERROR_INVALID_INPUT', 'check text, tags and cursor');
      throw error;
    }
    return { fetched: page.items.filter((version) => passesGuards(version, binding.allowedKinds)), nextKeyset: page.nextCursor, total: page.total };
  }

  async function redactRows(rows: readonly CatalogRow[], call: ToolCall): Promise<CatalogRow[]> {
    const redacted = await dependencies.redactor.redactJson(rows.map((row) => ({ title: row.title, summary: row.summary, tags: row.tags, license: row.license })));
    const parsed = redacted.status === 'redacted' ? RedactedRowsSchema.safeParse(redacted.value) : null;
    if (parsed === null || !parsed.success) throw new AgentRunError(call.scope.role, { kind: 'redaction-failed' });
    return rows.map((row, index) => {
      const clean = parsed.data[index];
      if (clean === undefined) throw new AgentRunError(call.scope.role, { kind: 'redaction-failed' });
      return CatalogRowSchema.parse({
        ...row,
        title: clean.title.slice(0, TITLE_MAX_CHARS),
        summary: clean.summary.slice(0, summaryMaxChars),
        // A tag the redactor changed is no longer a valid tag; it is dropped, never shown altered.
        tags: clean.tags.filter((tag) => TagSchema.safeParse(tag).success && row.tags.includes(tag)),
        license: row.license === null || clean.license === null ? null : { ...row.license, name: clean.license.name.slice(0, TITLE_MAX_CHARS) },
      });
    });
  }

  return {
    name: TOOL,
    description: describe(binding),
    inputSchema: CatalogSearchInputSchema,
    envelopeSchema: CatalogSearchEnvelopeSchema,
    invalidInput: (issues) =>
      toolFailure(TOOL, 'ERROR_INVALID_INPUT', `invalid ${[...new Set(issues.map((issue) => issue.path.join('.') || 'input'))].join(', ')}`),

    async run(input, call): Promise<ToolSuccess<CatalogRow[], AssetVersion[]>> {
      const requested = input.kinds === undefined || input.kinds.length === 0 ? binding.allowedKinds : input.kinds;
      if (requested.some((kind) => !binding.allowedKinds.includes(kind))) {
        throw toolFailure(TOOL, 'ERROR_INVALID_INPUT', `kinds must be among: ${binding.allowedKinds.join(', ')}`);
      }
      const cursor = parseCursor(input.cursor);
      if (cursor === null) throw toolFailure(TOOL, 'ERROR_INVALID_INPUT', `cursor comes from ${ENVELOPE_PAGINATION_KEY} only`);
      const kinds = [...new Set(requested)].sort();
      const normalized = JSON.stringify({
        kinds,
        tags: [...new Set(input.tags ?? [])].sort(),
        text: (input.text ?? '').trim().toLowerCase(),
        limit: input.limit,
        cursor: formatCursor(cursor),
      });
      const memoKey = `${call.scope.runId}::${call.scope.stageId}::${createHash('sha256').update(normalized).digest('hex')}`;
      const page = call.state.catalogPages.get(memoKey) ?? (await fetchPage(input, kinds, cursor));
      call.state.catalogPages.set(memoKey, page);

      const candidates = page.fetched.slice(cursor.skip, cursor.skip + input.limit);
      if (candidates.length === 0) throw toolFailure(TOOL, 'ERROR_NO_MATCH', toolErrorHints.noMatch);
      const rows = await redactRows(candidates.map(toRow), call);
      // Overflow moves to the next page; nothing is cut silently (topology 3.2 size cap).
      while (rows.length > 1 && JSON.stringify(rows).length > resultMaxChars) rows.pop();
      const shown = candidates.slice(0, rows.length);

      const offered = call.state.offeredRefsOf(call.scope.role, [...call.scope.packetRefs, ...call.scope.recipeBindingRefs]);
      for (const row of rows) offered.add(row.ref);

      const pages = Math.max(1, Math.ceil(page.total / input.limit));
      const nextSkip = cursor.skip + rows.length;
      const next: SearchCursor | null =
        nextSkip < page.fetched.length
          ? { page: cursor.page + 1, keyset: cursor.keyset, skip: nextSkip }
          : page.nextKeyset === null
            ? null
            : { page: cursor.page + 1, keyset: page.nextKeyset, skip: 0 };
      return {
        dsl: `catalog.search kinds=${kinds.join(',')} tags=${(input.tags ?? []).join(',')} text=${JSON.stringify(input.text ?? '')} limit=${input.limit} cursor=${formatCursor(cursor)}`,
        result: rows,
        handoff: [...shown],
        pagination: next === null ? null : `page ${cursor.page} of ${Math.max(pages, cursor.page + 1)}; pass cursor "${formatCursor(next)}"`,
        preview: rows.map((row) => `${row.ref} ${row.kind} ${row.title}`).join('\n'),
      };
    },
  };
}
