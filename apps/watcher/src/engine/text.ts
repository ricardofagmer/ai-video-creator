/** Cuts text to a schema maximum, so a long executor summary never makes a run-file write fail. */
export function clip(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Field limits of C3 the engine writes free text into. */
export const textLimits = {
  stepDetail: 500,
  eventText: 2000,
  activityText: 500,
  ownerText: 2000,
  stageSummary: 500,
};
