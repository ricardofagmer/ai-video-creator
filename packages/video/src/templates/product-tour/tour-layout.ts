/**
 * 16:9 geometry of the product tour (SPEC 0002 R1-15), derived from the Spesia tour's layout
 * (`SpesiaDemo.tsx`: app card centred under a chip row, a free band below it for captions).
 * Colours and fonts come from `../../theme`; only positions live here.
 */
export const TOUR_CANVAS = { width: 1920, height: 1080 } as const;

const sideInset = 240;
const cardTop = 112;
const cardWidth = TOUR_CANVAS.width - 2 * sideInset;
// Keeps the app at 16:9 inside the card so a 1920x1080 capture fills it without letterboxing.
const cardHeight = Math.round((cardWidth * 9) / 16);
const captionBandTop = cardTop + cardHeight + 12;

export const tourLayout = {
  sideInset,
  /** Chip row (step number and on-screen text) and progress, above the card. */
  headerTop: 26,
  card: { left: sideInset, top: cardTop, width: cardWidth, height: cardHeight },
  /**
   * Layout space for the captions the `captions` stage burns after composition (R1-14 passes
   * `captions: []`). Its centre is at about 93% of the height: the recipe's
   * `format.captions.yPercent` must stay inside this band.
   */
  captionBand: { top: captionBandTop, height: TOUR_CANVAS.height - captionBandTop },
} as const;
