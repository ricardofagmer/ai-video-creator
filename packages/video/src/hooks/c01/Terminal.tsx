import type { ReactElement, ReactNode } from 'react';
import { hookColors, monoFont } from '../hook-theme';
import { PromptCard } from './PromptCard';
import { commands, world } from './world';

/** Everything the terminal shows at one frame; computed from the beat clock by the composition. */
export interface TerminalState {
  userPrompt: string;
  claudeSay: string;
  /** 0..1 of the commit call typed. */
  commitTyped: number;
  commitCard: { appear: number; press: number; alarm: number };
  /** 0..1: card collapses and the commit output appears. */
  commitApproved: number;
  pushTyped: number;
  pushCard: { appear: number; alarm: number };
  /** 0..1: the transcript loses its colour (the cards keep theirs). */
  desaturate: number;
  /** Blinking caret, false while the AI is frozen. */
  caretOn: boolean;
}

function typed(text: string, amount: number): string {
  return text.slice(0, Math.round(text.length * Math.min(1, Math.max(0, amount))));
}

function Row({ top, children, color = hookColors.text }: { top: number; children: ReactNode; color?: string }): ReactElement {
  return (
    <div style={{ position: 'absolute', left: world.pad, right: world.pad, top, color, whiteSpace: 'pre', lineHeight: `${world.lineH}px` }}>
      {children}
    </div>
  );
}

function ToolCall({ top, text, caret }: { top: number; text: string; caret: boolean }): ReactElement {
  return (
    <Row top={top}>
      <span style={{ color: hookColors.green }}>{'●'} </span>
      <span style={{ fontWeight: 700 }}>Bash</span>
      <span style={{ color: hookColors.dim }}>(</span>
      {text}
      {caret ? <span style={{ backgroundColor: hookColors.text, color: hookColors.window }}> </span> : null}
      {text.length > 0 && !caret ? <span style={{ color: hookColors.dim }}>)</span> : null}
    </Row>
  );
}

/** A recreated Claude Code session (nothing real on screen: no paths, accounts or keys). */
export function Terminal({ state }: { state: TerminalState }): ReactElement {
  const commitText = typed(commands.commit, state.commitTyped);
  const pushText = typed(commands.push, state.pushTyped);
  const typingCommit = state.commitTyped > 0 && state.commitTyped < 1;
  const typingPush = state.pushTyped > 0 && state.pushTyped < 1;
  const cardLeft = world.pad;
  return (
    <div
      style={{
        position: 'absolute',
        left: world.terminal.x,
        top: world.terminal.y,
        width: world.terminal.w,
        height: world.terminal.h,
        borderRadius: 26,
        overflow: 'hidden',
        backgroundColor: hookColors.window,
        border: `2px solid ${hookColors.windowEdge}`,
        boxShadow: '0 40px 120px rgba(0, 0, 0, 0.55)',
        fontFamily: monoFont,
        fontSize: world.fontSize,
      }}
    >
      <div style={{ height: world.titleBarH, backgroundColor: hookColors.windowBar, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 24 }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((color) => (
          <div key={color} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }} />
        ))}
        <div style={{ marginLeft: 18, color: hookColors.dim, fontSize: 22 }}>claude — ~/app</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, filter: `saturate(${1 - state.desaturate * 0.9}) brightness(${1 - state.desaturate * 0.3})` }}>
        <div
          style={{
            position: 'absolute',
            left: world.pad,
            right: world.pad,
            top: world.rows.header,
            height: 118,
            border: `2px solid ${hookColors.accent}`,
            borderRadius: 14,
            padding: '16px 24px',
            boxSizing: 'border-box',
            color: hookColors.text,
            lineHeight: 1.4,
          }}
        >
          <div>
            <span style={{ color: hookColors.accent }}>{'✻'}</span> Claude Code
          </div>
          <div style={{ color: hookColors.dim, fontSize: 22 }}>EngineOS rules loaded: base, security, git, context</div>
        </div>
        <Row top={world.rows.userPrompt} color={hookColors.dim}>
          {'> '}
          <span style={{ color: hookColors.text }}>{state.userPrompt}</span>
        </Row>
        <Row top={world.rows.claudeSay}>
          <span style={{ color: hookColors.text }}>{'●'} </span>
          {state.claudeSay}
        </Row>
        <ToolCall top={world.rows.commitCall} text={commitText} caret={typingCommit || (state.caretOn && state.commitTyped === 0)} />
        <div style={{ opacity: state.commitApproved }}>
          <Row top={world.rows.commitCard} color={hookColors.dim}>
            {'  ⎿  '}
            <span style={{ color: hookColors.text }}>{commands.commitOut}</span>
          </Row>
          <Row top={world.rows.commitCard + world.lineH} color={hookColors.dim}>
            {'     '}
            {commands.commitStat}
          </Row>
        </div>
        {state.pushTyped > 0 ? <ToolCall top={world.rows.pushCall} text={pushText} caret={typingPush} /> : null}
      </div>
      {state.commitApproved < 1 ? (
        <PromptCard
          command={commands.commit}
          guardVerb="git commit"
          appear={state.commitCard.appear * (1 - state.commitApproved)}
          press={state.commitCard.press}
          alarm={state.commitCard.alarm}
          left={cardLeft}
          top={world.rows.commitCard}
        />
      ) : null}
      {state.pushCard.appear > 0 ? (
        <PromptCard command={commands.push} guardVerb="git push" appear={state.pushCard.appear} press={0} alarm={state.pushCard.alarm} left={cardLeft} top={world.rows.pushCard} />
      ) : null}
    </div>
  );
}
