const TAB = 0x09;
const NEWLINE = 0x0a;

/**
 * C0 controls except tab and newline, DEL, and C1 controls. Owner text (schedule titles, brief
 * titles, run titles) is printed verbatim otherwise, so an ESC or CSI sequence stored in a title
 * could repaint or retitle the terminal (security review SEC-2, defence in depth).
 */
function isTerminalControl(codePoint: number): boolean {
  if (codePoint === TAB || codePoint === NEWLINE) return false;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

/** The text with terminal control characters removed; tab and newline are kept for layout. */
export function stripTerminalControls(text: string): string {
  let clean = '';
  for (const character of text) {
    if (!isTerminalControl(character.codePointAt(0) ?? 0)) clean += character;
  }
  return clean;
}
