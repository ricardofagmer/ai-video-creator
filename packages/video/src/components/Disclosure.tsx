import type { ReactElement } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { brand, layout } from '../theme';

/** Final-scene disclosure: small but legible (30 px, high-contrast muted tone), inside the safe zone. */
export function Disclosure({ text }: { text: string }): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        position: 'absolute',
        left: layout.left,
        right: layout.right,
        bottom: layout.disclosureBottom,
        textAlign: 'center',
        fontSize: 30,
        lineHeight: 1.3,
        fontWeight: 500,
        color: brand.text,
        opacity: interpolate(frame, [0, 0.4 * fps], [0, 0.85], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    >
      {text}
    </div>
  );
}
