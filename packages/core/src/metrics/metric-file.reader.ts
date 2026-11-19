import { decodeCsvBytes, readCsv, type MetricImportRefusedReason, type Platform } from '@studio/shared/metrics';
import { mapMetricColumns, parseMetricRows, type ParsedMetricRows } from './metric-rows.parser';
import { platformProfiles } from './profiles';

export type MetricFileRead =
  | { status: 'read'; parsed: ParsedMetricRows; ignoredColumns: number }
  | { status: 'refused'; refusal: MetricImportRefusedReason };

/**
 * The pure stages of an import, in order (SPEC 0006 section 5.3): decode (strict UTF-8, size, zip
 * and NUL refused), read (RFC 4180 with row, column and cell bounds), map (the platform profile's
 * header allowlist) and parse (per-row ids and numbers). The first refusal ends it and nothing is
 * written; row failures are issues and the rest of the file continues. The bytes stay in memory.
 */
export function readMetricFile(bytes: Uint8Array, platform: Platform): MetricFileRead {
  const decoded = decodeCsvBytes(bytes);
  if (decoded.status === 'refused') return { status: 'refused', refusal: decoded.reason };
  const read = readCsv(decoded.text);
  if (read.status === 'refused') return { status: 'refused', refusal: read.reason };
  const profile = platformProfiles[platform];
  const mapping = mapMetricColumns(read.header, profile);
  if (mapping.status === 'refused') return { status: 'refused', refusal: mapping.reason };
  return { status: 'read', parsed: parseMetricRows(read.rows, mapping, profile), ignoredColumns: mapping.ignoredColumns };
}
