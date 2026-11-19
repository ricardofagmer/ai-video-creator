import { type MetricCellParser } from './cell-parsers';
import { type Platform } from './enums';
import { type MetricName } from './snapshot';

/*
 * PROVISIONAL (SPEC 0006 Q7): the CSV header aliases below are the starting lists of SPEC 0006
 * section 5.3, and every one of them is **Unverified**. They wait for the owner's real header row
 * of one export per platform; when those rows arrive, this file is the only place to correct, and
 * R3-02's three parser profiles (`packages/core/src/metrics/profiles/`) read their aliases from it.
 * Everything else in the metrics protocol is final.
 *
 * Matching rule (section 5.3 "map"): header text trimmed, compared case-insensitively and exactly
 * against an alias; any other column is counted and dropped before parsing.
 */

/** One canonical metric column: its accepted header spellings and the cell parser it uses. */
export interface MetricColumnAliases {
  readonly aliases: readonly string[];
  readonly parser: MetricCellParser;
}

/** The data a platform profile is built from. `views` and an id column are always required. */
export interface PlatformColumnAliases {
  readonly platform: Platform;
  /** Columns holding the platform video id or the full video URL; the first one present is used. */
  readonly idColumns: readonly string[];
  readonly columns: Readonly<Partial<Record<MetricName, MetricColumnAliases>>>;
  /** Id-cell values that mark a summary row to skip (YouTube's first `Total` row). */
  readonly skipRowIdValues: readonly string[];
}

const count = (...aliases: string[]): MetricColumnAliases => ({ aliases, parser: 'integer' });

export const provisionalPlatformColumnAliases: Readonly<Record<Platform, PlatformColumnAliases>> = Object.freeze({
  youtube: {
    platform: 'youtube',
    /** `Content` holding the 11-character video id (Unverified). */
    idColumns: ['Content'],
    columns: {
      views: count('Views'),
      watchTimeSeconds: { aliases: ['Watch time (hours)'], parser: 'hours' },
      impressions: count('Impressions'),
      averageViewDurationSeconds: { aliases: ['Average view duration'], parser: 'duration' },
      averageViewPercent: { aliases: ['Average percentage viewed (%)'], parser: 'percent' },
      likes: count('Likes'),
      comments: count('Comments added'),
      shares: count('Shares'),
      followersGained: count('Subscribers'),
    },
    skipRowIdValues: ['Total'],
  },
  instagram: {
    platform: 'instagram',
    /** `Permalink` holding the post URL (Unverified). `Post ID` is a numeric media id and is not used. */
    idColumns: ['Permalink'],
    columns: {
      views: count('Views', 'Plays'),
      reach: count('Reach'),
      impressions: count('Impressions'),
      likes: count('Likes'),
      comments: count('Comments'),
      shares: count('Shares'),
      saves: count('Saves'),
      followersGained: count('Follows'),
    },
    skipRowIdValues: [],
  },
  tiktok: {
    platform: 'tiktok',
    /**
     * Section 5.3 names no TikTok link column and leaves unverified that one exists; `Video link`
     * is a placeholder name only. Without a real id column TikTok works through the form.
     */
    idColumns: ['Video link'],
    columns: {
      views: count('Total views', 'Video views'),
      likes: count('Total likes', 'Likes'),
      comments: count('Total comments', 'Comments'),
      shares: count('Total shares', 'Shares'),
    },
    skipRowIdValues: [],
  },
});

/** The alias comparison key: trimmed and lower-cased (section 5.3). */
export function headerKey(header: string): string {
  return header.trim().toLowerCase();
}
