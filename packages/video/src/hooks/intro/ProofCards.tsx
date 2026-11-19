import type { ReactElement, ReactNode } from 'react';
import { hookColors, monoFont, motifColors } from '../hook-theme';

const CARD_WIDTH = 940;

/** A terminal-style window; `glow` tints the border for the alarm moments. */
function Window({ title, glow, children }: { title: string; glow: string | null; children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        width: CARD_WIDTH,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: hookColors.window,
        border: `3px solid ${glow ?? hookColors.windowEdge}`,
        boxShadow: glow ? `0 0 46px ${glow}, 0 30px 80px rgba(0,0,0,0.55)` : '0 30px 80px rgba(0,0,0,0.55)',
        fontFamily: monoFont,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', backgroundColor: hookColors.windowBar }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((color) => (
          <div key={color} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }} />
        ))}
        <span style={{ marginLeft: 14, fontSize: 24, color: hookColors.dim }}>{title}</span>
      </div>
      <div style={{ padding: '26px 30px 30px', fontSize: 31, lineHeight: 1.5, color: hookColors.text }}>{children}</div>
    </div>
  );
}

/** Lines appear one by one from `reveal` (0..count). */
function Reveal({ index, reveal, children }: { index: number; reveal: number; children: ReactNode }): ReactElement {
  const amount = Math.min(1, Math.max(0, reveal - index));
  return <div style={{ opacity: amount, transform: `translateX(${(1 - amount) * -24}px)` }}>{children}</div>;
}

const RULE_TREE: readonly { name: string; note: string; color: string }[] = [
  { name: 'CLAUDE.md', note: 'constitution', color: hookColors.text },
  { name: 'rules/', note: '20 rules', color: motifColors[0] },
  { name: 'skills/', note: '19 skills', color: motifColors[1] },
  { name: 'agents/', note: '22 agents', color: motifColors[2] },
  { name: 'hooks/', note: 'guards', color: motifColors[3] },
];

/** The EngineOS repository tree, the proof that "rules" is a real, versioned thing. */
export function RulesCard({ reveal }: { reveal: number }): ReactElement {
  return (
    <Window title="engineos" glow={null}>
      {RULE_TREE.map((entry, index) => (
        <Reveal key={entry.name} index={index} reveal={reveal}>
          <span style={{ color: entry.color, fontWeight: 700 }}>{entry.name.padEnd(11, ' ')}</span>
          <span style={{ color: hookColors.dim }}> {entry.note}</span>
        </Reveal>
      ))}
    </Window>
  );
}

/** The guard's real deny line for a commit that adds a secret (git-write-guard.ts). */
export function SecretCard({ reveal, alarm }: { reveal: number; alarm: number }): ReactElement {
  return (
    <Window title="claude code" glow={alarm > 0.05 ? hookColors.alarm : null}>
      <Reveal index={0} reveal={reveal}>
        <span style={{ color: hookColors.green }}>●</span> Bash(git commit -m "add config")
      </Reveal>
      <Reveal index={1} reveal={reveal}>
        <div style={{ marginTop: 14, padding: '18px 22px', borderRadius: 14, backgroundColor: 'rgba(255, 90, 95, 0.12)', border: `2px solid ${hookColors.alarm}`, fontSize: 28, lineHeight: 1.45 }}>
          <span style={{ color: hookColors.alarm, fontWeight: 700 }}>[engineos] git commit denied:</span> config.ts line 3 matches secret pattern{' '}
          <span style={{ color: hookColors.amber }}>openai-api-key</span>; remove the secret and rotate it (rules/security.md)
        </div>
      </Reveal>
    </Window>
  );
}

const AGENT_COUNT = 22;
/** Agents the supervisor dispatches in this example (lit dots); the rest stay idle. */
const ACTIVE_AGENTS = new Set([3, 11]);

/** The router line every request gets, then the 22 agents with only the needed ones lit. */
export function RouterCard({ reveal, dots }: { reveal: number; dots: number }): ReactElement {
  return (
    <Window title="claude code" glow={null}>
      <Reveal index={0} reveal={reveal}>
        <span style={{ color: hookColors.accent, fontWeight: 700 }}>EngineOS · Router</span>
      </Reveal>
      <Reveal index={1} reveal={reveal}>
        <span style={{ color: hookColors.dim }}>[router]</span> intent=backend risk=low
      </Reveal>
      <Reveal index={2} reveal={reveal}>
        <span style={{ color: hookColors.dim }}>dispatch=</span>
        <span style={{ color: hookColors.amber }}>parallel-independent</span>
      </Reveal>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 14, marginTop: 26 }}>
        {Array.from({ length: AGENT_COUNT }, (_, index) => {
          const shown = Math.min(1, Math.max(0, dots * AGENT_COUNT - index));
          const active = ACTIVE_AGENTS.has(index) && dots >= 1;
          return (
            <div
              key={index}
              style={{
                height: 46,
                borderRadius: 12,
                opacity: shown,
                transform: `scale(${0.5 + shown * 0.5})`,
                backgroundColor: active ? hookColors.accent : 'rgba(244, 247, 251, 0.10)',
                boxShadow: active ? `0 0 22px ${hookColors.accent}` : 'none',
              }}
            />
          );
        })}
      </div>
    </Window>
  );
}

export const proofCardWidth = CARD_WIDTH;
