import { Text, type TextProps } from 'ink';
import { type ReactElement } from 'react';
import { stripTerminalControls } from '../output/terminal-text.js';

export interface SafeTextProps extends Omit<TextProps, 'children'> {
  children: string;
}

/**
 * Ink `Text` for any string read from a run folder, a model, an error or the environment. Ink
 * writes text as given, so the dashboard passes every such string through the same filter as
 * `ConsolePrinter`: an ESC or CSI sequence in a title, an activity line or a notice never reaches
 * the terminal (baseline review 2026-11-21).
 */
export function SafeText({ children, ...textProps }: SafeTextProps): ReactElement {
  return <Text {...textProps}>{stripTerminalControls(children)}</Text>;
}
