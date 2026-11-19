/**
 * C01 world layout in app pixels. The camera, spotlights and cursor all aim at these boxes,
 * so every position lives here once.
 */
export const world = {
  terminal: { x: 0, y: 0, w: 900, h: 1180 },
  titleBarH: 56,
  pad: 36,
  lineH: 46,
  fontSize: 28,
  /** Transcript rows (top y of each). */
  rows: {
    header: 86,
    userPrompt: 236,
    claudeSay: 330,
    commitCall: 400,
    commitCard: 462,
    pushCall: 590,
    pushCard: 652,
  },
  /** Permission card size. */
  card: { w: 828, h: 300 },
  /** "1. Yes" option inside the card, relative to the card's top-left. */
  yesOption: { x: 34, y: 196, w: 220, h: 48 },
  /** Output lines that replace the commit card once approved. */
  commitOutputH: 104,
  /** Pills, below the commit card during the "writes" shot. */
  pills: { y: 800, gapY: 104 },
  rulePanel: { x: 0, y: 1260, w: 900, h: 660 },
  /** The highlighted rule line inside the rule panel (absolute world y). */
  ruleLineY: 1560,
} as const;

export const commands = {
  commit: 'git commit -am "fix: login redirect"',
  push: 'git push origin main',
  commitOut: '[main 3f2a1c9] fix: login redirect',
  commitStat: '1 file changed, 4 insertions(+), 1 deletion(-)',
} as const;

/** Lines of rules/git.md shown in the rule panel (real text of the rule). */
export const ruleLines: readonly { text: string; kind: 'heading' | 'text' | 'rule' | 'blank' }[] = [
  { text: '## Who may write', kind: 'heading' },
  { text: '', kind: 'blank' },
  { text: '- Under `ask`, every git or forge command', kind: 'text' },
  { text: '  that writes becomes a permission prompt.', kind: 'text' },
  { text: '- **One approval covers one action,', kind: 'rule' },
  { text: '  never a session.**', kind: 'rule' },
  { text: '  A `yes` to `git commit` is not a `yes`', kind: 'text' },
  { text: '  to the `git push` that follows.', kind: 'text' },
];
