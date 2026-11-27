import type { CSSProperties, ReactElement } from 'react';
import { type SkillStageKind } from '../skill-stage';
import styles from '../skill-stage.module.css';

type StageStyle = CSSProperties & { '--stage-order'?: number; '--stage-size'?: string | number };

/** Position in a staggered animation, and the mark's width, height or flex share. */
function mark(order: number, size?: string | number): StageStyle {
  return size === undefined ? { '--stage-order': order } : { '--stage-order': order, '--stage-size': size };
}

function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

const timelineTracks: readonly (readonly (readonly [number, string | undefined])[])[] = [
  [
    [34, styles.accent],
    [22, undefined],
    [38, styles.second],
  ],
  [
    [18, undefined],
    [52, styles.third],
    [24, undefined],
  ],
  [
    [60, styles.second],
    [30, styles.accent],
  ],
];
const lineWidths = ['70%', '45%', '88%', '58%', '34%'] as const;
const paperWidths = ['90%', '70%', '96%', '50%'] as const;
const barHeights = ['45%', '80%', '60%', '95%', '55%', '75%'] as const;
const bubbleWidths = ['58%', '46%', '36%'] as const;
const diffWidths = ['72%', '56%', '64%', '40%'] as const;

function scene(kind: SkillStageKind): ReactElement {
  switch (kind) {
    case 'timeline':
      return (
        <div className={`${styles.scene} ${styles.timeline}`}>
          {timelineTracks.map((clips, track) => (
            <div key={track} className={styles.track}>
              {clips.map(([share, tone], clip) => (
                <i key={clip} className={tone === undefined ? styles.clip : `${styles.clip} ${tone}`} style={mark(clip, share)} />
              ))}
            </div>
          ))}
          <span className={styles.playhead} />
        </div>
      );
    case 'waveform':
      return (
        <div className={`${styles.scene} ${styles.wave}`}>
          {range(16).map((bar) => (
            <i key={bar} className={styles.waveBar} style={mark(bar % 7)} />
          ))}
        </div>
      );
    case 'captions':
      return (
        <div className={`${styles.scene} ${styles.captions}`}>
          <span className={styles.frame} />
          <span className={styles.words}>
            {range(4).map((word) => (
              <i key={word} className={styles.word} style={mark(word)} />
            ))}
          </span>
        </div>
      );
    case 'paper':
      return (
        <div className={`${styles.scene} ${styles.paper}`}>
          {paperWidths.map((width, line) => (
            <i key={line} className={styles.line} style={mark(line, width)} />
          ))}
        </div>
      );
    case 'checklist':
      return (
        <div className={`${styles.scene} ${styles.checklist}`}>
          {range(3).map((row) => (
            <span key={row} className={styles.checkRow}>
              <i className={styles.checkBox} style={mark(row)} />
              <i className={styles.checkLine} />
            </span>
          ))}
        </div>
      );
    case 'canvas':
      return (
        <div className={`${styles.scene} ${styles.canvas}`}>
          <span className={styles.canvasFrame}>
            <i className={styles.canvasPicture} />
          </span>
        </div>
      );
    case 'bars':
      return (
        <div className={`${styles.scene} ${styles.bars}`}>
          {barHeights.map((height, bar) => (
            <i key={bar} className={styles.bar} style={mark(bar, height)} />
          ))}
        </div>
      );
    case 'graph':
      return (
        <svg className={styles.graph} viewBox="0 0 200 112" preserveAspectRatio="xMidYMid meet">
          <line className={styles.edge} x1="50" y1="56" x2="100" y2="30" />
          <line className={styles.edge} x1="50" y1="56" x2="100" y2="82" />
          <line className={styles.edge} x1="100" y1="30" x2="152" y2="56" />
          <line className={styles.edge} x1="100" y1="82" x2="152" y2="56" />
          <rect className={styles.accentFill} x="34" y="46" width="32" height="20" rx="5" />
          <rect className={styles.thirdFill} x="84" y="20" width="32" height="20" rx="5" />
          <rect className={styles.secondFill} x="84" y="72" width="32" height="20" rx="5" />
          <rect className={styles.accentFill} x="136" y="46" width="32" height="20" rx="5" />
        </svg>
      );
    case 'lines':
      return (
        <div className={`${styles.scene} ${styles.lines}`}>
          {lineWidths.map((width, line) => (
            <i key={line} className={styles.line} style={mark(line, width)} />
          ))}
        </div>
      );
    case 'chat':
      return (
        <div className={`${styles.scene} ${styles.chat}`}>
          {bubbleWidths.map((width, bubble) => (
            <i key={bubble} className={styles.bubble} style={mark(bubble, width)} />
          ))}
        </div>
      );
    case 'grade':
      return (
        <div className={`${styles.scene} ${styles.picture}`}>
          <span className={styles.gradeFrame}>
            <i className={styles.gradeSweep} />
          </span>
        </div>
      );
    case 'logo':
      return (
        <div className={`${styles.scene} ${styles.picture}`}>
          <span className={styles.frame} />
          <i className={styles.logoMark} />
        </div>
      );
    case 'fade':
      return (
        <div className={`${styles.scene} ${styles.picture}`}>
          <span className={`${styles.frame} ${styles.fadePicture}`} />
        </div>
      );
    case 'sheet':
      return (
        <div className={`${styles.scene} ${styles.sheet}`}>
          {range(15).map((cell) => (
            <i key={cell} className={styles.cell} style={mark(cell)} />
          ))}
        </div>
      );
    case 'diff':
      return (
        <div className={`${styles.scene} ${styles.lines} ${styles.diff}`}>
          {diffWidths.map((width, line) => (
            <i key={line} className={styles.line} style={mark(line, width)} />
          ))}
        </div>
      );
    case 'capture':
      return (
        <div className={`${styles.scene} ${styles.picture}`}>
          <span className={styles.screen}>
            <i className={styles.recordDot} />
            <i className={styles.pointer} />
          </span>
        </div>
      );
  }
}

/** The animated cover of a skill card: a looping sketch of the kind of work the skill does. Decoration only. */
export function SkillStage({ kind }: { kind: SkillStageKind }): ReactElement {
  return (
    <div className={styles.stage} aria-hidden="true">
      {scene(kind)}
    </div>
  );
}
