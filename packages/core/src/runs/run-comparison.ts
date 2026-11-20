import { z } from 'zod';
import { canonicalJson } from '@studio/shared/recipes';
import {
  ComparisonIdSchema,
  IsoDateTimeSchema,
  RunComparisonLinkSchema,
  RunIdSchema,
  type ComparisonId,
  type RunComparisonLink,
  type RunFile,
  type RunId,
} from '@studio/shared/run-format';

/**
 * One arm of an A/B comparison as the comparisons module asks for it (SPEC 0003 section 5.3). The
 * run id is allocated by the caller so both run.json files can name their peer when written; the
 * consent is always null at creation and is written only by the comparison start.
 */
export const ComparisonArmDraftSchema = z
  .object({ runId: RunIdSchema, comparison: RunComparisonLinkSchema })
  .strict()
  .refine((arm) => arm.comparison.costConsent === null, {
    path: ['comparison', 'costConsent'],
    message: 'cost consent is written when the comparison starts, never at creation',
  })
  .refine((arm) => arm.comparison.peerRunId !== arm.runId, { path: ['comparison', 'peerRunId'], message: 'a run cannot be its own peer' });
export type ComparisonArmDraft = z.input<typeof ComparisonArmDraftSchema>;

/** The pair consent the comparison start writes into each arm together with `pending`. */
export const ComparisonStartConsentSchema = z
  .object({
    comparisonId: ComparisonIdSchema,
    costConsent: z
      .object({
        worstCaseUsd: z.number().finite().nonnegative(),
        acceptedBy: z.string().min(1).max(100),
        acceptedAt: IsoDateTimeSchema,
      })
      .strict(),
  })
  .strict();
export type ComparisonStartConsent = z.input<typeof ComparisonStartConsentSchema>;

/** Column values of one `comparisons` row as the run folders give them (files win, ADR 0003). */
export interface ComparisonIndexData {
  id: ComparisonId;
  title: string;
  createdBy: string;
  createdAt: Date;
  subjectJson: string;
  briefHash: string;
  runAId: RunId;
  runBId: RunId;
  startedAt: Date | null;
}

/** What a rebuild keeps of a linked run: enough to pair it, never the brief. */
export interface LinkedRunFacts {
  runId: RunId;
  title: string;
  createdBy: RunFile['createdBy'];
  link: RunComparisonLink;
}

const ARM_A_TITLE_SUFFIX = ' (A)';

export function linkedRunFactsOf(run: RunFile): LinkedRunFacts | null {
  if (run.comparison === undefined) return null;
  return { runId: run.runId, title: run.title, createdBy: run.createdBy, link: run.comparison };
}

function isPair(armA: LinkedRunFacts, armB: LinkedRunFacts): boolean {
  return (
    armA.link.arm === 'a' &&
    armB.link.arm === 'b' &&
    armA.link.peerRunId === armB.runId &&
    armB.link.peerRunId === armA.runId &&
    armA.link.briefHash === armB.link.briefHash &&
    armA.link.learningsCutoff === armB.link.learningsCutoff &&
    canonicalJson(armA.link.subject) === canonicalJson(armB.link.subject)
  );
}

/**
 * The comparison row restored from its two arms. Run files carry neither the comparison title nor
 * the owner who created it: the title is arm A's run title without its " (A)" suffix, and the
 * creator is the owner who accepted the cost when the pair was started, else the run's origin.
 * The repository keeps an existing row's title and creator, so only a lost row takes these.
 */
function toComparisonIndexData(armA: LinkedRunFacts, armB: LinkedRunFacts): ComparisonIndexData {
  const title = armA.title.endsWith(ARM_A_TITLE_SUFFIX) ? armA.title.slice(0, -ARM_A_TITLE_SUFFIX.length) : armA.title;
  const consent = armA.link.costConsent ?? armB.link.costConsent;
  return {
    id: armA.link.comparisonId,
    title: title.length > 0 ? title : armA.title,
    createdBy: consent?.acceptedBy ?? armA.createdBy,
    createdAt: new Date(armA.link.learningsCutoff),
    subjectJson: canonicalJson(armA.link.subject),
    briefHash: armA.link.briefHash,
    runAId: armA.runId,
    runBId: armB.runId,
    startedAt: consent === null ? null : new Date(consent.acceptedAt),
  };
}

export interface ComparisonPairing {
  rows: ComparisonIndexData[];
  /** Comparison ids whose run folders do not hold exactly one consistent `a` and `b` arm. */
  unpaired: ComparisonId[];
}

/** Groups linked runs by comparison id; only a consistent pair becomes a row. */
export function pairComparisonArms(linkedRuns: readonly LinkedRunFacts[]): ComparisonPairing {
  const groups = new Map<ComparisonId, LinkedRunFacts[]>();
  for (const linked of linkedRuns) {
    const group = groups.get(linked.link.comparisonId) ?? [];
    group.push(linked);
    groups.set(linked.link.comparisonId, group);
  }
  const pairing: ComparisonPairing = { rows: [], unpaired: [] };
  for (const [comparisonId, group] of groups) {
    const armA = group.find((linked) => linked.link.arm === 'a');
    const armB = group.find((linked) => linked.link.arm === 'b');
    if (group.length === 2 && armA !== undefined && armB !== undefined && isPair(armA, armB)) {
      pairing.rows.push(toComparisonIndexData(armA, armB));
    } else {
      pairing.unpaired.push(comparisonId);
    }
  }
  return pairing;
}
