import {
  ANALYST_ROLE,
  ANALYZE_SITE_TASK,
  AnalystPacketSchema,
  OutputContractSchema,
  SITE_ANALYSIS_PAGE_TEXT_MAX,
  escapeDelimiterTags,
  untrustedTextMaxChars,
  type AnalystPacket,
} from '@studio/shared/agents';
import { type Brief } from '@studio/shared/recipes';
import { delimitUntrusted, packetBaseFor, type PacketCoordinates } from './packet-support';

export interface AnalystPacketSource {
  readonly coordinates: PacketCoordinates;
  readonly brief: Brief;
  /** The page the research stage read (https only; the packet schema refuses anything else). */
  readonly sourceUrl: string;
  /** Captured page title; third-party text. */
  readonly pageTitle: string;
  /** Captured visible page text; third-party text, cut and delimited here. */
  readonly pageText: string;
  /** True when the research stage already cut the page text. */
  readonly pageTextTruncated: boolean;
  /** True when the research stage recorded the `site-screenshot` output for SiteScreenshotTool. */
  readonly screenshotAvailable: boolean;
}

const PAGE_TITLE_MAX_CHARS = 500;

/**
 * Site analyst packet (docs/specs/2026-11-23-site-analysis-design.md). Never sees: the cost
 * ledger, the catalog, other stages' sessions, biometric assets, credentials (no source field
 * carries them). The page text is cut to `SITE_ANALYSIS_PAGE_TEXT_MAX` before delimiting, so the
 * escaped text and its tags fit `UntrustedTextSchema`; any cut is reported in `pageTextTruncated`.
 */
export function buildAnalystPacket(source: AnalystPacketSource): AnalystPacket {
  const pageText = source.pageText.slice(0, SITE_ANALYSIS_PAGE_TEXT_MAX);
  // Escaping embedded tags lengthens the text, so a hostile page could still pass the block cap;
  // `truncate` cuts the escaped body to fit, and that cut is reported like the length cut.
  const delimitedPageText = delimitUntrusted(pageText, { attributes: { id: 'page-text' }, maxChars: untrustedTextMaxChars, overflow: 'truncate' });
  const cutHere = source.pageText.length > SITE_ANALYSIS_PAGE_TEXT_MAX || !delimitedPageText.includes(escapeDelimiterTags(pageText));
  return AnalystPacketSchema.parse({
    ...packetBaseFor(ANALYST_ROLE, source.coordinates),
    task: ANALYZE_SITE_TASK,
    inputs: {
      brief: source.brief,
      sourceUrl: source.sourceUrl,
      // The title is a plain packet field, not a delimited block; escaping keeps it from opening or closing one.
      pageTitle: escapeDelimiterTags(source.pageTitle).slice(0, PAGE_TITLE_MAX_CHARS),
      pageText: delimitedPageText,
      pageTextTruncated: source.pageTextTruncated || cutHere,
      screenshotAvailable: source.screenshotAvailable,
      language: source.brief.language,
    },
    constraints: { pageIsUntrusted: true },
    outputContract: OutputContractSchema.enum.SiteAnalysis,
  });
}
