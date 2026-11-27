import { readFile } from 'node:fs/promises';
import { UntrustedTextTooLongError, type AssetText, type PacketCoordinates } from '@studio/core/agents';
import { WRITER_SKILLS_MAX, type BrandKitSummary, type ModelRoleName, type RunArtifactId } from '@studio/shared/agents';
import { type TemplateDetails } from '@studio/shared/catalog';
import type { StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { type ReviewSubject } from '@studio/shared/run-format';
import { ZodError } from 'zod';
import { EntryFileUnavailableError } from '@studio/core/catalog';
import { boundAssets, boundOfKind, type CatalogLookup } from '../shared/catalog-lookup';
import { needsPerson } from '../shared/stage-results';

/** Artifact ids the Reviewer may read per subject (C7 RunArtifactReadTool, topology section 5). */
export const reviewArtifacts: Readonly<Record<ReviewSubject, readonly RunArtifactId[]>> = {
  script: ['brief', 'script', 'site-analysis', 'reference-analyses'],
  scenes: ['brief', 'script', 'scenes', 'captures-index', 'site-analysis', 'reference-analyses'],
  render: ['brief', 'scenes', 'qa-metrics', 'checks'],
};

export function coordinatesOf(context: StageExecutionContext): PacketCoordinates {
  return { runId: context.runId, stageId: context.stage.stageId, attempt: context.attempt };
}

/**
 * Text of a bound prompt or skill version, read from the path the engine re-hashed at
 * `preflight`. Only file-layout, non-biometric text assets are read; the packet builder delimits
 * the text as untrusted (topology section 8).
 */
export async function boundPromptText(context: StageExecutionContext, preferredSlot: string): Promise<AssetText | null> {
  const bound = boundOfKind(context, 'prompt', preferredSlot);
  if (bound === null || bound.asset.layout !== 'file' || bound.asset.sensitivity === 'biometric') return null;
  return { ref: bound.asset.ref, text: await readFile(bound.asset.absolutePath, 'utf8') };
}

/**
 * Entry texts of the skills bound to `slot` (e.g. `skill:writer`), in binding order and at most
 * `WRITER_SKILLS_MAX`. With none on that slot, every skill bound to the recipe is used, once per
 * ref: the owner's skills guide every generating stage, not only the one whose slot they named.
 * Biometric versions are never read. A bound skill whose entry file cannot be read is reported by
 * ref, so the stage stops instead of running without guidance the owner chose.
 */
export async function boundSkillTexts(
  context: StageExecutionContext,
  catalog: CatalogLookup,
  slot: string,
): Promise<{ status: 'read'; skills: AssetText[] } | { status: 'unreadable'; ref: string }> {
  const allSkills = boundAssets(context).filter((candidate) => candidate.asset.kind === 'skill' && candidate.asset.sensitivity !== 'biometric');
  const onSlot = allSkills.filter((candidate) => candidate.slot === slot);
  const chosen = onSlot.length > 0 ? onSlot : allSkills.filter((candidate, index) => allSkills.findIndex((other) => other.asset.ref === candidate.asset.ref) === index);
  const skills: AssetText[] = [];
  for (const { asset } of chosen.slice(0, WRITER_SKILLS_MAX)) {
    try {
      skills.push({ ref: asset.ref, text: await catalog.skillEntryText(asset.ref) });
    } catch (error) {
      if (!(error instanceof EntryFileUnavailableError)) throw error;
      return { status: 'unreadable', ref: asset.ref };
    }
  }
  return { status: 'read', skills };
}

/** The owner stop for a bound skill whose entry file cannot be read. */
export function unreadableSkillStop(context: StageExecutionContext, ref: string, slot: string): StageFailure {
  return needsPerson(
    { kind: 'needs-person', stepKey: context.stepKey },
    `A skill ${ref} vinculada à receita (${slot}) não pôde ser lida.`,
    'Confira o arquivo de entrada da skill no catálogo ou tire a skill da receita e retome a execução.',
  );
}

export async function brandVoiceText(context: StageExecutionContext, catalog: CatalogLookup): Promise<AssetText | undefined> {
  const bound = boundOfKind(context, 'brand-kit');
  if (bound === null) return undefined;
  const version = await catalog.versionOfKind(bound.asset, 'brand-kit');
  const tone = version?.details.toneOfVoice.trim() ?? '';
  return tone.length === 0 ? undefined : { ref: bound.asset.ref, text: tone };
}

/** `palette, fonts, logo ref, motion style` of the bound brand kit; null when none is bound. */
export async function brandKitSummary(context: StageExecutionContext, catalog: CatalogLookup): Promise<BrandKitSummary | null> {
  const bound = boundOfKind(context, 'brand-kit');
  if (bound === null) return null;
  const version = await catalog.versionOfKind(bound.asset, 'brand-kit');
  if (version === null) return null;
  const { colors, fonts, logoRefs, motionStyle } = version.details;
  return { palette: colors, fonts, logoRef: logoRefs[0] ?? null, motionStyle };
}

export async function boundTemplate(
  context: StageExecutionContext,
  catalog: CatalogLookup,
): Promise<{ ref: string; details: TemplateDetails } | null> {
  const bound = boundOfKind(context, 'template', 'template');
  if (bound === null) return null;
  const version = await catalog.versionOfKind(bound.asset, 'template');
  return version === null ? null : { ref: bound.asset.ref, details: version.details };
}

export type PacketBuild<Packet> = { status: 'built'; packet: Packet } | { status: 'invalid'; failure: StageFailure };

/**
 * Builds a C7 packet with the core builder. A packet that does not validate (an oversized bound
 * text, a recipe value outside the packet bounds) repeats identically on every attempt, so it goes
 * to the owner as `agent-failed` instead of burning attempts.
 */
export function buildPacket<Packet>(context: StageExecutionContext, role: ModelRoleName, build: () => Packet): PacketBuild<Packet> {
  try {
    return { status: 'built', packet: build() };
  } catch (error) {
    if (!(error instanceof ZodError) && !(error instanceof UntrustedTextTooLongError)) throw error;
    const reason = error instanceof UntrustedTextTooLongError ? `o texto vinculado ${error.ref} é longo demais` : 'o pacote do agente é inválido';
    return {
      status: 'invalid',
      failure: needsPerson(
        { kind: 'agent-failed', role, stepKey: context.stepKey },
        `O agente ${role} não foi chamado: ${reason}.`,
        'Ajuste o ativo vinculado ou a receita e retome a execução.',
      ),
    };
  }
}
