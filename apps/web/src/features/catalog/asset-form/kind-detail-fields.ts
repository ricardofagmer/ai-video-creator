import { type SelectOption } from '@studio/ui';
import { type AssetKind } from '@studio/shared/catalog';
import { type WebMessages } from '@/messages';

/** How one kind-specific field is drawn; the values and their parsing live in kind-details-model. */
export interface DetailFieldSpec {
  key: string;
  label: string;
  control: 'text' | 'mono' | 'number' | 'textarea' | 'json' | 'select' | 'list';
  options?: readonly SelectOption[];
  optional?: boolean;
  help?: string;
  /** Spans both columns of the field grid. */
  wide?: boolean;
}

/** PRD 5.2 kind-specific fields per kind (design/telas/04 item 5); `prompt` uses the variables table. */
export function detailFieldSpecsOf(t: WebMessages['catalog']['form']['kindDetails']): Readonly<Record<AssetKind, readonly DetailFieldSpec[]>> {
  const listHelp = t.listHelp;
  return {
  template: [
    {
      key: 'engine',
      label: t.engine,
      control: 'select',
      options: [
        { value: 'remotion', label: 'Remotion' },
        { value: 'hyperframes', label: 'HyperFrames' },
      ],
    },
    { key: 'compositionId', label: t.compositionId, control: 'mono' },
    { key: 'width', label: t.width, control: 'number' },
    { key: 'height', label: t.height, control: 'number' },
    { key: 'fps', label: t.fps, control: 'number' },
    { key: 'durationMin', label: t.durationMin, control: 'number' },
    { key: 'durationMax', label: t.durationMax, control: 'number' },
    { key: 'inputSchema', label: t.inputSchema, control: 'json', help: t.inputSchemaHelp, wide: true },
    { key: 'sceneSchema', label: t.sceneSchema, control: 'json', optional: true, help: t.sceneSchemaHelp, wide: true },
    { key: 'cameraMoves', label: t.cameraMoves, control: 'list', optional: true, help: listHelp },
    { key: 'transitions', label: t.transitions, control: 'list', optional: true, help: listHelp },
  ],
  'ai-model': [
    {
      key: 'modelType',
      label: t.modelType,
      control: 'select',
      options: [
        { value: 'provider-model', label: t.modelTypes.providerModel },
        { value: 'voice-clone', label: t.modelTypes.voiceClone },
        { value: 'avatar', label: t.modelTypes.avatar },
        { value: 'checkpoint', label: t.modelTypes.checkpoint },
        { value: 'lora', label: 'LoRA' },
      ],
    },
    {
      key: 'provider',
      label: t.provider,
      control: 'select',
      options: [
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'elevenlabs', label: 'ElevenLabs' },
        { value: 'local-voice', label: t.providers.localVoice },
        { value: 'other', label: t.providers.other },
      ],
    },
    {
      key: 'modelIdRefType',
      label: t.modelIdRefType,
      control: 'select',
      options: [
        { value: 'env', label: t.modelIdRefTypes.env },
        { value: 'keychain', label: t.modelIdRefTypes.keychain },
        { value: 'literal', label: t.modelIdRefTypes.literal },
      ],
    },
    { key: 'modelIdRefValue', label: t.modelIdRefValue, control: 'mono', help: t.modelIdRefHelp },
  ],
  reference: [
    {
      key: 'subKind',
      label: t.subKind,
      control: 'select',
      options: [
        { value: 'video', label: t.subKinds.video },
        { value: 'image', label: t.subKinds.image },
        { value: 'audio', label: t.subKinds.audio },
        { value: 'style', label: t.subKinds.style },
        { value: 'screenshot-set', label: t.subKinds.screenshotSet },
        { value: 'text', label: t.subKinds.text },
        { value: 'website', label: t.subKinds.website },
      ],
    },
    { key: 'referenceNotes', label: t.referenceNotes, control: 'textarea', optional: true, wide: true },
  ],
  prompt: [],
  skill: [
    { key: 'entryFile', label: t.entryFile, control: 'mono', help: t.entryFileHelp },
    { key: 'description', label: t.description, control: 'textarea', optional: true, wide: true },
  ],
  image: [
    { key: 'width', label: t.width, control: 'number' },
    { key: 'height', label: t.height, control: 'number' },
    {
      key: 'purpose',
      label: t.purpose,
      control: 'select',
      options: [
        { value: 'logo', label: t.purposes.logo },
        { value: 'still', label: t.purposes.still },
        { value: 'background', label: t.purposes.background },
        { value: 'cover', label: t.purposes.cover },
        { value: 'other', label: t.purposes.other },
      ],
    },
  ],
  music: [
    { key: 'durationSec', label: t.durationSec, control: 'number' },
    { key: 'bpm', label: t.bpm, control: 'number', optional: true },
    { key: 'integratedLufs', label: t.integratedLufs, control: 'number', optional: true },
  ],
  sfx: [{ key: 'durationSec', label: t.durationSec, control: 'number' }],
  'brand-kit': [{ key: 'brandKitJson', label: t.brandKit, control: 'json', help: t.brandKitHelp, wide: true }],
};
}
