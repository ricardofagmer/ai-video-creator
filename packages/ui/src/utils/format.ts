// pt-BR formatting for values the kit renders (D16: interface text in pt-BR).
const usdFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Formats a USD amount for display, for example `US$ 1,25`. */
export function formatUsd(amount: number): string {
  return usdFormatter.format(amount);
}

/** Formats a byte count with a binary unit, for example `12,4 MB`. */
export function formatBytes(sizeBytes: number): string {
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < byteUnits.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : 1;
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })} ${byteUnits[unitIndex] ?? 'B'}`;
}

/** Shortens a sha-256 hex digest for display; the full value stays in `title`. */
export function shortenHash(contentHash: string, length = 12): string {
  return contentHash.length > length ? `${contentHash.slice(0, length)}…` : contentHash;
}
