import { type BadgeTone } from '@studio/ui';

const percentFormatter = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const ratingFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

/** `87%`; `sem dados` when there is nothing to divide. */
export function formatShare(share: number | null): string {
  return share === null ? 'sem dados' : percentFormatter.format(share);
}

/** `3,6` (a mean rating, 1 to 5). */
export function formatRating(rating: number): string {
  return ratingFormatter.format(rating);
}

/** `2 d 4 h`, `3 h 15 min`, `12 min`, `menos de 1 min`. */
export function formatDuration(ms: number): string {
  if (ms < minuteMs) return 'menos de 1 min';
  if (ms >= dayMs) return `${Math.floor(ms / dayMs)} d ${Math.floor((ms % dayMs) / hourMs)} h`;
  if (ms >= hourMs) return `${Math.floor(ms / hourMs)} h ${Math.floor((ms % hourMs) / minuteMs)} min`;
  return `${Math.floor(ms / minuteMs)} min`;
}

export interface TargetVerdict {
  label: string;
  tone: BadgeTone;
}

const noData: TargetVerdict = { label: 'Sem dados', tone: 'neutral' };
const met: TargetVerdict = { label: 'Na meta', tone: 'success' };
const missed: TargetVerdict = { label: 'Fora da meta', tone: 'warning' };

/** `met` true, false or null (not enough data yet). */
export function targetVerdict(isMet: boolean | null): TargetVerdict {
  if (isMet === null) return noData;
  return isMet ? met : missed;
}
