import type { ReactElement } from 'react';
import { hookColors, monoFont } from '../hook-theme';
import { ruleLines, world } from './world';

const LINE_H = 50;
const FIRST_LINE_TOP = 110;

/** rules/git.md in an editor pane; `highlight` (0..1) lights the rule line. */
export function RulePanel({ appear, highlight, fileName }: { appear: number; highlight: number; fileName: string }): ReactElement {
  const panel = world.rulePanel;
  return (
    <div
      style={{
        position: 'absolute',
        left: panel.x,
        top: panel.y,
        width: panel.w,
        height: panel.h,
        borderRadius: 26,
        overflow: 'hidden',
        backgroundColor: '#0D1628',
        border: `2px solid ${hookColors.windowEdge}`,
        fontFamily: monoFont,
        fontSize: 28,
        opacity: appear,
        transform: `translateY(${(1 - appear) * 80}px)`,
        boxShadow: '0 40px 120px rgba(0, 0, 0, 0.55)',
      }}
    >
      <div style={{ height: 56, backgroundColor: hookColors.windowBar, display: 'flex', alignItems: 'center', paddingLeft: 28, color: hookColors.text, fontSize: 24, gap: 14 }}>
        <span style={{ color: hookColors.accent }}>{'■'}</span>
        {fileName}
      </div>
      {ruleLines.map((line, index) => {
        const top = FIRST_LINE_TOP + index * LINE_H;
        const isRule = line.kind === 'rule';
        return (
          <div key={`${index}-${line.text}`} style={{ position: 'absolute', left: 0, right: 0, top, height: LINE_H, display: 'flex', alignItems: 'center' }}>
            {isRule ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: `rgba(46, 196, 182, ${highlight * 0.22})`,
                  borderLeft: `6px solid rgba(46, 196, 182, ${highlight})`,
                }}
              />
            ) : null}
            <span style={{ width: 70, textAlign: 'right', color: hookColors.dim, fontSize: 22, paddingRight: 22, position: 'relative' }}>{index + 12}</span>
            <span
              style={{
                position: 'relative',
                whiteSpace: 'pre',
                fontWeight: line.kind === 'heading' || isRule ? 700 : 400,
                color: line.kind === 'heading' ? hookColors.amber : isRule ? hookColors.text : 'rgba(244, 247, 251, 0.7)',
                opacity: isRule ? 1 : 1 - highlight * 0.45,
              }}
            >
              {line.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** World y of the highlighted rule lines' centre, for the camera. */
export const ruleFocusY = world.rulePanel.y + FIRST_LINE_TOP + 4.5 * LINE_H + LINE_H / 2;
