import { readFile } from 'node:fs/promises';
import { UntrustedTextTooLongError, type AssetText, type PacketCoordinates } from '@studio/core/agents';
import { type BrandKitSummary, type ModelRoleName, type RunArtifactId } from '@studio/shared/agents';
import { type TemplateDetails } from '@studio/shared/catalog';
import type { StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { type ReviewSubject } from '@studio/shared/run-format';
import { ZodError } from 'zod';
import { boundOfKind, type CatalogLookup } from '../shared/catalog-lookup';
import { needsPerson } from '../shared/stage-results';

/** Artifact ids the Reviewer may read per subject (C7 RunArtifactReadTool, topology section 5). */
export const reviewArtifacts: Readonly<Record<ReviewSubject, readonly RunArtifactId[]>> = {
  script: ['brief', 'script'],
  scenes: ['brief', 'script', 'scenes', 'captures-index'],
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
