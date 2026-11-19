import { interpolate } from 'remotion';
import { easeInOut } from './clock';

/** Camera pose in world (app) pixels: the point shown at the focus, and the zoom. */
export interface CameraPose {
  cx: number;
  cy: number;
  zoom: number;
}

export interface CameraKey extends CameraPose {
  /** Beat at which the move towards this pose starts. */
  atBeat: number;
  /** Length of the move in beats. */
  moveBeats: number;
  easing?: (input: number) => number;
}

/** Where on screen the camera's focus point sits (between the title band and the captions). */
export const FOCUS = { x: 540, y: 900 } as const;

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Pose at a beat: holds each key until the next move starts, then eases into it. */
export function poseAt(keys: readonly CameraKey[], beat: number): CameraPose {
  const first = keys[0];
  if (!first) return { cx: 0, cy: 0, zoom: 1 };
  let pose: CameraPose = { cx: first.cx, cy: first.cy, zoom: first.zoom };
  for (const key of keys.slice(1)) {
    if (beat <= key.atBeat) break;
    const amount = interpolate(beat, [key.atBeat, key.atBeat + Math.max(key.moveBeats, 0.0001)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: key.easing ?? easeInOut,
    });
    // Zoom moves in log space so a 0.6x -> 2.4x push feels even.
    pose = {
      cx: lerp(pose.cx, key.cx, amount),
      cy: lerp(pose.cy, key.cy, amount),
      zoom: Math.exp(lerp(Math.log(pose.zoom), Math.log(key.zoom), amount)),
    };
  }
  return pose;
}

/** Handheld breathing so the camera never fully stops (a few px, slow). */
export function breathe(pose: CameraPose, timeS: number): CameraPose {
  return {
    cx: pose.cx + (Math.sin(timeS * 0.83) * 3 + Math.sin(timeS * 1.91) * 1.5) / pose.zoom,
    cy: pose.cy + (Math.cos(timeS * 0.71) * 3 + Math.sin(timeS * 1.37) * 1.2) / pose.zoom,
    zoom: pose.zoom * (1 + Math.sin(timeS * 0.53) * 0.004),
  };
}

/** Short decaying shake in screen px, for the two shocks of the story only. */
export function shakeOffset(beat: number, shockBeats: readonly number[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const shock of shockBeats) {
    const age = beat - shock;
    if (age < 0 || age > 0.7) continue;
    const decay = Math.exp(-age * 7);
    x += Math.sin(age * 95) * 14 * decay;
    y += Math.cos(age * 77) * 10 * decay;
  }
  return { x, y };
}

export function worldTransform(pose: CameraPose): string {
  const tx = FOCUS.x - pose.cx * pose.zoom;
  const ty = FOCUS.y - pose.cy * pose.zoom;
  return `translate(${tx}px, ${ty}px) scale(${pose.zoom})`;
}

/** World point -> screen point under a pose (for cursor, pills and spotlights drawn in screen space). */
export function toScreen(pose: CameraPose, x: number, y: number): { x: number; y: number } {
  return { x: FOCUS.x + (x - pose.cx) * pose.zoom, y: FOCUS.y + (y - pose.cy) * pose.zoom };
}

/** Screen-space speed of the camera, used for motion blur proportional to movement. */
export function cameraSpeed(previous: CameraPose, current: CameraPose): number {
  const panX = (current.cx - previous.cx) * current.zoom;
  const panY = (current.cy - previous.cy) * current.zoom;
  const zoomPx = Math.abs(Math.log(current.zoom / previous.zoom)) * 900;
  return Math.hypot(panX, panY) + zoomPx;
}
