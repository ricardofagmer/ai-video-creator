import { type EgressEntry, type QaSummary, type ReviewSubject, type RunFile, type StageId } from '@studio/shared/run-format';
import { type ReviewOutcome } from '../shared/stage-artifacts';

/**
 * `report.md` (PRD 7.4): owner-facing pt-BR, with the five sections C5 `writeRunMarkdown`
 * requires. Built from recorded run files only; it names assets by ref and files by run path,
 * never a biometric path or a secret. Reviewer issues appear as the Reviewer wrote them.
 */
export function reportMarkdown(source: {
  title: string;
  run: Readonly<RunFile>;
  /** The stage writing this report (`package`). */
  writtenByStage: StageId;
  summary: QaSummary;
  outcomes: ReadonlyMap<ReviewSubject, ReviewOutcome>;
  egress: readonly EgressEntry[];
  voiceEngine: string | null;
  planSource: 'planner' | 'recipe-default' | null;
}): string {
  const { metrics } = source.summary;
  const lines: string[] = [`# Relatório — ${source.title}`, ''];

  lines.push('## O que foi feito', '');
  for (const stage of source.run.stages) {
    // The report is an output of the stage that writes it, so that stage is still open in `run.json`
    // here; the report only exists once it delivers.
    const status = stage.stageId === source.writtenByStage ? 'delivered' : stage.outcome.status;
    lines.push(`- ${String(stage.number).padStart(2, '0')} ${stage.stageId}: ${status}`);
  }
  lines.push(`- Vídeo final: final.mp4, ${(metrics.durationMs / 1000).toFixed(1)} s, ${metrics.width}x${metrics.height}, ${metrics.fps} fps.`, '');

  lines.push('## Decisões', '');
  lines.push(`- Plano: ${source.planSource === 'recipe-default' ? 'padrão da receita (planejador indisponível)' : 'planejador'}.`);
  if (source.voiceEngine !== null) lines.push(`- Voz da narração: ${source.voiceEngine}.`);
  for (const [subject, outcome] of source.outcomes) {
    lines.push(
      outcome.status === 'recorded'
        ? `- Revisão ${subject}: nota geral ${outcome.verdict.overall} após ${outcome.revisions} revisão(ões).`
        : `- Revisão ${subject}: indisponível.`,
    );
  }
  lines.push('');

  lines.push('## O que saiu da máquina', '');
  if (source.egress.length === 0) lines.push('- Nada saiu da máquina (modo simulado ou só ferramentas locais).');
  for (const entry of source.egress) lines.push(`- ${entry.at} ${entry.provider}: ${entry.summary}`);
  lines.push('');

  lines.push('## O que ouvir com atenção', '');
  if (metrics.audio.status === 'present') {
    lines.push(`- Loudness integrada ${metrics.audio.integratedLufs.toFixed(1)} LUFS, pico real ${metrics.audio.truePeakDbtp.toFixed(1)} dBTP.`);
  } else {
    lines.push('- Sem trilha de áudio medida.');
  }
  if (metrics.captionMaxDriftMs !== null) lines.push(`- Deriva máxima das legendas: ${metrics.captionMaxDriftMs} ms (tempos de palavra estimados).`);
  for (const outcome of source.outcomes.values()) {
    if (outcome.status === 'recorded') for (const issue of outcome.verdict.blockingIssues) lines.push(`- ${issue}`);
  }
  lines.push('');

  lines.push('## Avisos', '');
  if (source.summary.warnings.length === 0) lines.push('- Nenhum aviso.');
  for (const warning of source.summary.warnings) lines.push(`- ${warning}`);
  return `${lines.join('\n')}\n`;
}
