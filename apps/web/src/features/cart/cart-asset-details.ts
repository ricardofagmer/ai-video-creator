import { type AssetVersionView } from '@studio/shared/api';

/** Labels of the asset facts the video prompt lists under each item. */
export interface CartAssetDetailLabels {
  description: string;
  engine: string;
  format: string;
  duration: string;
  cameraMoves: string;
  transitions: string;
  modelType: string;
  provider: string;
  colors: string;
  fonts: string;
  captions: string;
  toneOfVoice: string;
  tempo: string;
  size: string;
  purpose: string;
  referenceKind: string;
  referenceNotes: string;
  variables: string;
  notes: string;
}

type Line = readonly [label: string, value: string];

function seconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
}

function kindLines(version: AssetVersionView, labels: CartAssetDetailLabels): Line[] {
  switch (version.kind) {
    case 'template': {
      const { engine, compositionId, canvas, aspect, fps, duration, cameraMoves, transitions } = version.details;
      return [
        [labels.engine, `${engine} (${compositionId})`],
        [labels.format, `${canvas.width}x${canvas.height}, ${aspect}, ${fps} fps`],
        [labels.duration, `${duration.minSec}s - ${duration.maxSec}s`],
        [labels.cameraMoves, cameraMoves.join(', ')],
        [labels.transitions, transitions.join(', ')],
      ];
    }
    case 'ai-model':
      return [
        [labels.modelType, version.details.modelType],
        [labels.provider, version.details.provider],
      ];
    case 'reference':
      return [
        [labels.referenceKind, version.details.subKind],
        [labels.referenceNotes, version.details.referenceNotes],
      ];
    case 'prompt':
      return [[labels.variables, version.details.variables.map((variable) => `${variable.name} (${variable.type})`).join(', ')]];
    case 'skill':
      return [[labels.description, version.details.description]];
    case 'image':
      return [
        [labels.size, `${version.details.width}x${version.details.height}`],
        [labels.purpose, version.details.purpose],
      ];
    case 'music':
      return [
        [labels.duration, seconds(version.details.durationMs)],
        [labels.tempo, version.details.bpm === null ? '' : `${version.details.bpm} bpm`],
      ];
    case 'sfx':
      return [[labels.duration, seconds(version.details.durationMs)]];
    case 'brand-kit': {
      const { colors, fonts, captionStyle, toneOfVoice } = version.details;
      return [
        [labels.colors, colors.map((color) => `${color.name} ${color.hex}`).join(', ')],
        [labels.fonts, fonts.map((font) => `${font.family} (${font.role})`).join(', ')],
        [labels.captions, `${captionStyle.fontFamily} ${captionStyle.fontSizePx}px ${captionStyle.color}, ${captionStyle.maxLines} lines`],
        [labels.toneOfVoice, toneOfVoice],
      ];
    }
  }
}

/** One Markdown bullet per fact of the version that has a value, kind facts first, then the notes. */
export function cartAssetDetailLines(version: AssetVersionView, labels: CartAssetDetailLabels): string[] {
  const lines: Line[] = [...kindLines(version, labels), [labels.notes, version.notes]];
  return lines.filter(([, value]) => value.trim() !== '').map(([label, value]) => `- ${label}: ${value.trim().replace(/\s*\n\s*/g, ' ')}`);
}
