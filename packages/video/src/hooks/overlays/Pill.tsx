import type { ReactElement } from 'react';
import { interpolate } from 'remotion';
import { easeOut } from '../clock';
import { monoFont } from '../hook-theme';

/** A labelled pill that pops in once and stays (accumulate, never flash). */
export function Pill(props: { label: string; color: string; beat: number; atBeat: number; fontSize?: number; icon?: 'lock' | 'check' | 'alert' }): ReactElement {
  const { label, color, beat, atBeat, fontSize = 34, icon = 'lock' } = props;
  const pop = interpolate(beat, [atBeat, atBeat + 0.35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const glow = interpolate(beat, [atBeat, atBeat + 1.2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        padding: `${fontSize * 0.42}px ${fontSize * 0.7}px`,
        borderRadius: 999,
        border: `3px solid ${color}`,
        backgroundColor: 'rgba(11, 20, 38, 0.92)',
        color: '#F4F7FB',
        fontFamily: monoFont,
        fontSize,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        opacity: pop,
        transform: `scale(${0.6 + pop * 0.4})`,
        boxShadow: `0 0 ${10 + glow * 40}px ${color}`,
      }}
    >
      <PillIcon kind={icon} color={color} size={fontSize * 0.9} />
      {label}
    </div>
  );
}

function PillIcon({ kind, color, size }: { kind: 'lock' | 'check' | 'alert'; color: string; size: number }): ReactElement {
  if (kind === 'check') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M4 12.5 L9.5 18 L20 6.5" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'alert') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M12 3 L22 20 L2 20 Z" fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M12 9.5 L12 14" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.4" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke={color} strokeWidth="2.6" />
      <path d="M8.2 10.5 V7.6 a3.8 3.8 0 0 1 7.6 0 V10.5" fill="none" stroke={color} strokeWidth="2.6" />
    </svg>
  );
}
