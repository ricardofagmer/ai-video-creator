import type { ReactElement } from 'react';

/** Native size of the drawing; callers scale it with `width`. */
export const AVATAR_VIEWBOX = { w: 600, h: 760 } as const;

const palette = {
  skin: '#D7A07C',
  skinShade: '#C08560',
  skinDeep: '#A96F4E',
  hair: '#1B1612',
  hairSide: '#2C231D',
  beard: '#241B16',
  shirt: '#1E2B47',
  shirtLight: '#2A3B60',
  shirtDeep: '#152038',
  mouth: '#5A2420',
  eyeWhite: '#F4EEE8',
  iris: '#3B2618',
  watch: '#111418',
  watchRing: '#2EC4B6',
} as const;

export interface AvatarPose {
  /** 0 closed .. 1 fully open, driven by the spoken words. */
  mouthOpen: number;
  /** 1 eyes open .. 0 shut. */
  eyeOpen: number;
  /** Head rotation in degrees around the neck. */
  tiltDeg: number;
  /** Vertical head offset in drawing px (nods). */
  nodPx: number;
  /** Pupil offset in drawing px: where he looks. */
  look: { x: number; y: number };
  /** 0..1 breathing phase for the chest. */
  breath: number;
}

export const restingPose: AvatarPose = { mouthOpen: 0, eyeOpen: 1, tiltDeg: 0, nodPx: 0, look: { x: 0, y: 0 }, breath: 0 };

/** A rounded limb between two points, drawn as a rotated capsule. */
function Limb(props: { x1: number; y1: number; x2: number; y2: number; width: number; fill: string }): ReactElement {
  const { x1, y1, x2, y2, width, fill } = props;
  const length = Math.hypot(x2 - x1, y2 - y1) + width;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <rect
      x={-length / 2}
      y={-width / 2}
      width={length}
      height={width}
      rx={width / 2}
      fill={fill}
      transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) rotate(${angle})`}
    />
  );
}

function Eye({ cx, cy, open, look }: { cx: number; cy: number; open: number; look: AvatarPose['look'] }): ReactElement {
  const height = Math.max(0.6, 8 * open);
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={14} ry={height} fill={palette.eyeWhite} />
      {open > 0.25 ? <circle cx={cx + look.x} cy={cy + look.y} r={Math.min(6.5, height)} fill={palette.iris} /> : null}
      {open > 0.25 ? <circle cx={cx + look.x + 2} cy={cy + look.y - 2} r={1.6} fill="#FFFFFF" opacity={0.8} /> : null}
      <path d={`M${cx - 16} ${cy - height + 1} Q${cx} ${cy - height - 6} ${cx + 16} ${cy - height + 1}`} stroke={palette.skinDeep} strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Mouth({ open }: { open: number }): ReactElement {
  if (open < 0.08) {
    return <path d="M282 303 Q300 309 318 303" stroke={palette.mouth} strokeWidth={4} fill="none" strokeLinecap="round" />;
  }
  const height = 3 + 13 * open;
  return (
    <g>
      <ellipse cx={300} cy={304} rx={17 + 3 * open} ry={height} fill={palette.mouth} />
      {open > 0.35 ? <rect x={288} y={304 - height + 1} width={24} height={Math.min(6, height * 0.45)} rx={2} fill="#EDE6DE" /> : null}
    </g>
  );
}

function Head({ pose }: { pose: AvatarPose }): ReactElement {
  return (
    <g transform={`translate(0 ${pose.nodPx}) rotate(${pose.tiltDeg} 300 370)`}>
      <ellipse cx={212} cy={238} rx={16} ry={28} fill={palette.skinShade} />
      <ellipse cx={388} cy={238} rx={16} ry={28} fill={palette.skinShade} />
      <path d="M218 175 C218 92 382 92 382 175 L382 250 C382 318 346 356 300 362 C254 356 218 318 218 250 Z" fill={palette.skin} />
      <path d="M352 150 C372 190 378 240 372 290 C366 260 360 210 346 170 Z" fill={palette.skinShade} opacity={0.5} />
      {/* Short hair: volume on top, faded sides. */}
      <path d="M212 192 C204 112 254 62 312 62 C372 62 402 112 390 192 C386 166 378 148 364 140 C334 126 266 126 238 140 C224 148 216 166 212 192 Z" fill={palette.hair} />
      <path d="M212 192 C210 178 212 164 218 152 L222 196 Z" fill={palette.hairSide} opacity={0.75} />
      <path d="M390 192 C392 178 390 164 384 152 L380 196 Z" fill={palette.hairSide} opacity={0.75} />
      <path d="M236 98 C262 70 320 64 356 86 C328 78 282 82 252 104 Z" fill="#33291F" />
      <path d="M262 82 C290 70 330 72 350 84" stroke="#3A2F25" strokeWidth={3} fill="none" opacity={0.7} />
      {/* Thick brows, the right one a touch higher. */}
      <path d="M238 192 Q258 180 286 186" stroke={palette.hair} strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d="M314 185 Q342 178 362 190" stroke={palette.hair} strokeWidth={10} fill="none" strokeLinecap="round" />
      <Eye cx={263} cy={214} open={pose.eyeOpen} look={pose.look} />
      <Eye cx={337} cy={214} open={pose.eyeOpen} look={pose.look} />
      <path d="M300 218 C298 236 290 254 290 262 C294 268 306 268 310 262" stroke={palette.skinDeep} strokeWidth={4} fill="none" strokeLinecap="round" />
      {/* Full, short beard with the mouth opening cut through it. */}
      <path d="M216 228 C214 312 248 370 300 372 C352 370 386 312 384 228 C378 262 362 282 344 290 C324 282 276 282 256 290 C238 282 222 262 216 228 Z" fill={palette.beard} />
      <path d="M262 290 C280 276 320 276 338 290 C320 286 280 286 262 290 Z" fill={palette.beard} />
      <path d="M252 334 C272 356 328 356 348 334" stroke="#3A2D25" strokeWidth={3} fill="none" opacity={0.5} />
      <Mouth open={pose.mouthOpen} />
    </g>
  );
}

function Watch(): ReactElement {
  return (
    <g transform="rotate(-10 222 628)">
      <rect x={204} y={598} width={36} height={62} rx={8} fill={palette.watch} />
      <circle cx={222} cy={628} r={25} fill={palette.watch} />
      <circle cx={222} cy={628} r={20} fill="#1A2130" stroke={palette.watchRing} strokeWidth={2.5} />
      <path d="M214 622 Q222 616 230 622" stroke={palette.watchRing} strokeWidth={2} fill="none" opacity={0.7} />
    </g>
  );
}

/**
 * Ricardo as a flat-vector engineer: navy shirt with rolled sleeves, arms crossed,
 * smartwatch, short dark hair and a full beard. Every moving part comes from `pose`.
 */
export function Avatar({ pose = restingPose, width = 600 }: { pose?: AvatarPose; width?: number }): ReactElement {
  const chest = 1 + pose.breath * 0.012;
  return (
    <svg width={width} height={(width * AVATAR_VIEWBOX.h) / AVATAR_VIEWBOX.w} viewBox={`0 0 ${AVATAR_VIEWBOX.w} ${AVATAR_VIEWBOX.h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="avatar-shirt" x1="0" x2="1">
          <stop offset="0" stopColor={palette.shirtDeep} />
          <stop offset="0.45" stopColor={palette.shirt} />
          <stop offset="1" stopColor={palette.shirtDeep} />
        </linearGradient>
      </defs>
      <g transform={`translate(300 760) scale(1 ${chest}) translate(-300 -760)`}>
        <path d="M44 760 L44 560 C44 468 132 428 206 408 L300 440 L394 408 C468 428 556 468 556 560 L556 760 Z" fill="url(#avatar-shirt)" />
        <rect x={252} y={320} width={96} height={130} fill={palette.skinShade} />
        <ellipse cx={300} cy={376} rx={56} ry={18} fill={palette.skinDeep} opacity={0.4} />
        <path d="M254 420 L300 508 L346 420 Z" fill={palette.skinShade} />
        <path d="M206 404 L256 412 L300 508 L262 476 L224 442 Z" fill={palette.shirtLight} />
        <path d="M394 404 L344 412 L300 508 L338 476 L376 442 Z" fill={palette.shirtLight} />
        <line x1={300} y1={508} x2={300} y2={760} stroke={palette.shirtDeep} strokeWidth={3} />
        <circle cx={300} cy={548} r={5} fill={palette.shirtDeep} />
        <path d="M352 520 L432 520 L430 588 L354 588 Z" fill="none" stroke={palette.shirtDeep} strokeWidth={3} opacity={0.8} />
        {/* Upper arms down the sides. */}
        <ellipse cx={104} cy={604} rx={66} ry={124} fill={palette.shirt} />
        <ellipse cx={496} cy={604} rx={66} ry={124} fill={palette.shirt} />
        {/* Back forearm (hand tucked at left), watch on its wrist. */}
        <Limb x1={170} y1={636} x2={474} y2={700} width={68} fill={palette.skinShade} />
        <Watch />
        <Limb x1={442} y1={704} x2={510} y2={706} width={92} fill={palette.shirtLight} />
        {/* Front forearm, hand resting over the right bicep. */}
        <Limb x1={128} y1={690} x2={448} y2={634} width={74} fill={palette.skin} />
        <Limb x1={86} y1={700} x2={150} y2={688} width={96} fill={palette.shirtLight} />
        <g fill={palette.skin}>
          <rect x={448} y={600} width={58} height={26} rx={13} transform="rotate(-8 448 600)" />
          <rect x={452} y={624} width={56} height={24} rx={12} transform="rotate(-6 452 624)" />
          <rect x={454} y={646} width={50} height={22} rx={11} transform="rotate(-4 454 646)" />
        </g>
        <path d="M150 690 C250 676 360 652 440 640" stroke={palette.skinDeep} strokeWidth={3} fill="none" opacity={0.35} />
      </g>
      <Head pose={pose} />
    </svg>
  );
}
