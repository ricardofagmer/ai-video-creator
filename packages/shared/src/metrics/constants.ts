import { type Platform } from './enums';

/*
 * Metrics protocol constants (SPEC 0006 section 4.2). Every bound and pattern the api, core, web
 * and CLI agree on for publications and platform metrics lives here and nowhere else.
 */

/**
 * A platform video id after extraction. Ids are stored only after their pattern matches, so no
 * free text from a CSV or a URL path reaches SQLite (SPEC 0006 section 6).
 */
export const platformVideoIdPatterns: Readonly<Record<Platform, RegExp>> = Object.freeze({
  youtube: /^[A-Za-z0-9_-]{11}$/,
  /** The post shortcode, not the numeric media id of the Instagram export. */
  instagram: /^[A-Za-z0-9_-]{5,40}$/,
  tiktok: /^[0-9]{8,24}$/,
});

/** Upload, CSV and per-run bounds; the reader enforces the CSV ones while reading. */
export const metricsBounds = {
  maxFileBytes: 2_097_152,
  maxRows: 5_000,
  maxColumns: 64,
  maxCellChars: 2_000,
  maxIssuesShown: 50,
  maxUnmatchedShown: 50,
  maxPublicationsPerRun: 5,
  maxSnapshotsPerPublication: 400,
  urlChars: 300,
} as const;

/** B2, B13: a snapshot gives a signal only from `minViews`; a baseline needs `baselineMinVideos`. */
export const platformSignalRules = {
  minViews: 100,
  baselineMinVideos: 5,
} as const;

/** Older snapshots shown per publication beside the one in force (SPEC 0006 section 4.4). */
export const METRIC_HISTORY_SHOWN = 20;
