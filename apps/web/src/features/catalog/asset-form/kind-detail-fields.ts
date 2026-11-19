import { type SelectOption } from '@studio/ui';
import { type AssetKind } from '@studio/shared/catalog';

/** How one kind-specific field is drawn; the values and their parsing live in kind-details-model. */
export interface DetailFieldSpec {
  key: string;
  label: string;
  control: 'text' | 'mono' | 'number' | 'textarea' | 'json' | 'select';
  options?: readonly SelectOption[];
  optional?: boolean;
  help?: string;
  /** Spans both columns of the field grid. */
  wide?: boolean;
}

const listHelp = 'Separados por vírgula, em minúsculas com hífens.';

/** PRD 5.2 kind-specific fields per kind (design/telas/04 item 5); `prompt` uses the variables table. */
export const detailFieldSpecs: Readonly<Record<AssetKind, readonly DetailFieldSpec[]>> = {
  template: [
    {
      key: 'engine',
      label: 'Motor',
      control: 'select',
      options: [
        { value: 'remotion', label: 'Remotion' },
        { value: 'hyperframes', label: 'HyperFrames' },
      ],
    },
    { key: 'compositionId', label: 'Id da composição', control: 'mono' },
    { key: 'width', label: 'Largura (px)', control: 'number' },
    { key: 'height', label: 'Altura (px)', control: 'number' },
    { key: 'fps', label: 'FPS', control: 'number' },
    { key: 'durationMin', label: 'Duração mínima (s)', control: 'number' },
    { key: 'durationMax', label: 'Duração máxima (s)', control: 'number' },
    { key: 'inputSchema', label: 'Esquema de entrada', control: 'json', help: 'JSON Schema das props da composição.', wide: true },
    { key: 'sceneSchema', label: 'Esquema de cena', control: 'json', optional: true, help: 'JSON Schema de uma cena.', wide: true },
    { key: 'cameraMoves', label: 'Movimentos de câmera', control: 'text', optional: true, help: listHelp },
    { key: 'transitions', label: 'Transições', control: 'text', optional: true, help: listHelp },
  ],
  'ai-model': [
    {
      key: 'modelType',
      label: 'Tipo de modelo',
      control: 'select',
      options: [
        { value: 'provider-model', label: 'Modelo de provedor' },
        { value: 'voice-clone', label: 'Clone de voz' },
        { value: 'avatar', label: 'Avatar' },
        { value: 'checkpoint', label: 'Checkpoint' },
        { value: 'lora', label: 'LoRA' },
      ],
    },
    {
      key: 'provider',
      label: 'Provedor',
      control: 'select',
      options: [
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'elevenlabs', label: 'ElevenLabs' },
        { value: 'local-voice', label: 'Voz local' },
        { value: 'other', label: 'Outro' },
      ],
    },
    {
      key: 'modelIdRefType',
      label: 'Onde fica o id do modelo',
      control: 'select',
      options: [
        { value: 'env', label: 'Variável de ambiente' },
        { value: 'keychain', label: 'Item do Keychain' },
        { value: 'literal', label: 'Id público' },
      ],
    },
    { key: 'modelIdRefValue', label: 'Referência do modelo', control: 'mono', help: 'Nunca cole uma chave aqui.' },
  ],
  reference: [
    {
      key: 'subKind',
      label: 'Tipo de referência',
      control: 'select',
      options: [
        { value: 'video', label: 'Vídeo' },
        { value: 'image', label: 'Imagem' },
        { value: 'audio', label: 'Áudio' },
        { value: 'style', label: 'Estilo' },
        { value: 'screenshot-set', label: 'Conjunto de capturas de tela' },
        { value: 'text', label: 'Texto' },
      ],
    },
    { key: 'referenceNotes', label: 'Notas da referência', control: 'textarea', optional: true, wide: true },
  ],
  prompt: [],
  skill: [
    { key: 'entryFile', label: 'Arquivo de entrada', control: 'mono', help: 'Caminho dentro da pasta, por exemplo SKILL.md.' },
    { key: 'description', label: 'Descrição', control: 'textarea', optional: true, wide: true },
  ],
  image: [
    { key: 'width', label: 'Largura (px)', control: 'number' },
    { key: 'height', label: 'Altura (px)', control: 'number' },
    {
      key: 'purpose',
      label: 'Uso',
      control: 'select',
      options: [
        { value: 'logo', label: 'Logo' },
        { value: 'still', label: 'Imagem parada' },
        { value: 'background', label: 'Fundo' },
        { value: 'cover', label: 'Capa' },
        { value: 'other', label: 'Outro' },
      ],
    },
  ],
  music: [
    { key: 'durationSec', label: 'Duração (s)', control: 'number' },
    { key: 'bpm', label: 'BPM', control: 'number', optional: true },
    { key: 'integratedLufs', label: 'Loudness integrado (LUFS)', control: 'number', optional: true },
  ],
  sfx: [{ key: 'durationSec', label: 'Duração (s)', control: 'number' }],
  'brand-kit': [{ key: 'brandKitJson', label: 'Kit de marca', control: 'json', help: 'Cores, fontes, logos, legenda e zonas seguras em JSON.', wide: true }],
};
