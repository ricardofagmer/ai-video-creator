import {
  headerKey,
  type MetricCellParser,
  type MetricName,
  type Platform,
  type PlatformColumnAliases,
} from '@studio/shared/metrics';
import { isMetricName } from '../metric-columns.mapper';

/** One canonical column of a profile: its header keys (trimmed, lower-cased) and its cell parser. */
export interface ProfileColumn {
  readonly aliases: readonly string[];
  readonly parser: MetricCellParser;
}

/**
 * A platform parser profile (SPEC 0006 section 5.3) is data:
 * `{ platform, idColumns, required, columns, skipRow }`. It decides which header maps to which
 * canonical metric and which parser reads its cells; every other column is counted and dropped
 * before parsing. Header keys are compared exactly after `headerKey` (trimmed, case-insensitive).
 */
export interface PlatformProfile {
  readonly platform: Platform;
  /** Header keys of the id column, in preference order; the first one present is used. */
  readonly idColumns: readonly string[];
  /** Canonical metrics whose column must be present, or the import is refused. */
  readonly required: readonly MetricName[];
  readonly columns: Readonly<Partial<Record<MetricName, ProfileColumn>>>;
  /** True for an id cell that marks a summary row (YouTube's `Total`); the row is not data. */
  readonly skipRow: (idCell: string) => boolean;
}

/**
 * `views` is the only metric every platform reports and the one `PlatformMetrics` requires, so it
 * is the only required column whatever the alias lists say.
 */
const requiredMetrics: readonly MetricName[] = Object.freeze(['views']);

function columnsOf(source: PlatformColumnAliases): Partial<Record<MetricName, ProfileColumn>> {
  const columns: Partial<Record<MetricName, ProfileColumn>> = {};
  for (const [metric, column] of Object.entries(source.columns)) {
    if (column === undefined || !isMetricName(metric)) continue;
    columns[metric] = Object.freeze({ aliases: Object.freeze(column.aliases.map(headerKey)), parser: column.parser });
  }
  return columns;
}

/**
 * Builds a profile from its alias data. The alias lists are the provisional ones of
 * `provisionalPlatformColumnAliases` (SPEC 0006 Q7); replacing those lists with the owner's real
 * header rows changes the profiles through this function and nothing else.
 */
export function buildPlatformProfile(source: PlatformColumnAliases): PlatformProfile {
  const skipKeys = new Set(source.skipRowIdValues.map(headerKey));
  return Object.freeze({
    platform: source.platform,
    idColumns: Object.freeze(source.idColumns.map(headerKey)),
    required: requiredMetrics,
    columns: Object.freeze(columnsOf(source)),
    skipRow: (idCell: string): boolean => skipKeys.has(headerKey(idCell)),
  });
}
