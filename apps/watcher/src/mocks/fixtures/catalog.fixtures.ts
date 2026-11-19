import { BrandKitSummarySchema, type BrandKitSummary } from '@studio/shared/agents';
import {
  LicenseSchema,
  type AssetKind,
  type AssetLayout,
  type AssetRef,
  type License,
  type Sensitivity,
} from '@studio/shared/catalog';
import { type Sha256 } from '@studio/shared/run-format';

/** One catalog version the mock resolver knows. Hashes are sha-256 of `mock-catalog:<ref>`. */
export interface MockCatalogEntry {
  ref: AssetRef;
  kind: AssetKind;
  title: string;
  contentHash: Sha256;
  sizeBytes: number;
  mimeType: string;
  layout: AssetLayout;
  sensitivity: Sensitivity;
  license: License | null;
  /** Text an executor may hand to an agent, always delimited before it reaches a packet. */
  text: string;
}

// Parsed at load so a drifted fixture fails loudly instead of feeding a wrong shape downstream.
const spesiaLicense: License = LicenseSchema.parse({
  name: 'Spesia Music Library Standard',
  url: null,
  readOn: '2026-11-01',
  allowedUses: ['commercial', 'social-media', 'attribution-required'],
  terms: 'Uso em vídeos do autor com atribuição na descrição.',
});

/**
 * The bindings of `product-tour-16x9@1`. The fixture run.json pins the same hashes, so preflight
 * resolves every binding; a changed hash here reproduces the K4 `hash-mismatch` stop.
 */
const mockCatalog: readonly MockCatalogEntry[] = [
  {
    ref: 'product-tour-template@1',
    kind: 'template',
    title: 'Tour de produto 16:9',
    contentHash: '1e45a2d45d6dbc3cb36361f53a06d83f2095871926c4b052bcfd1152941c8762',
    sizeBytes: 4096,
    mimeType: 'application/vnd.studio.folder+json',
    layout: 'folder',
    sensitivity: 'normal',
    license: null,
    text: 'Modelo de tour de produto com cenas de captura, cartões de título e encerramento com logo.',
  },
  {
    ref: 'fagmer-brand@1',
    kind: 'brand-kit',
    title: 'Identidade Fagmer',
    contentHash: '91c73265dc123d75d49b348ae0c251fd9cae31d5037f88a5448dac08a2052e8a',
    sizeBytes: 2048,
    mimeType: 'application/json',
    layout: 'file',
    sensitivity: 'normal',
    license: null,
    text: 'Tom direto, frases curtas, sem jargão.',
  },
  {
    ref: 'writer-prompt@1',
    kind: 'prompt',
    title: 'Prompt do roteirista',
    contentHash: '2841398bd3ea58ab9853f86f85689cb403ca58519279d5792a4e46325d68e82e',
    sizeBytes: 1024,
    mimeType: 'text/markdown',
    layout: 'file',
    sensitivity: 'normal',
    license: null,
    text: 'Escreva um roteiro curto em pt-BR; toda frase factual cita uma afirmação verificada.',
  },
  {
    ref: 'spesia-music-680@1',
    kind: 'music',
    title: 'Spesia 680',
    contentHash: '8c8909f4111d48494e46d53cc9545e8da8156938fb089931b65d6f4eecd91b94',
    sizeBytes: 3_145_728,
    mimeType: 'audio/mpeg',
    layout: 'file',
    sensitivity: 'third-party',
    license: spesiaLicense,
    text: '',
  },
];

/** The brand-kit summary the director packet carries for `fagmer-brand@1`. */
export const mockBrandKitSummary: BrandKitSummary = BrandKitSummarySchema.parse({
  palette: [
    { name: 'primária', hex: '#1F6FEB' },
    { name: 'fundo', hex: '#F7F8FA' },
    { name: 'texto', hex: '#111827' },
  ],
  fonts: [
    { family: 'Inter', role: 'heading', ref: null },
    { family: 'Inter', role: 'body', ref: null },
  ],
  logoRef: null,
  motionStyle: 'Movimentos curtos com mola suave; cortes no tempo da narração.',
});

/** Camera moves and transitions the template allows (TemplateDetails in the real catalog). */
export const mockTemplateMotion = {
  cameraMoves: ['push-in', 'pan-right', 'static'],
  transitions: ['cut', 'crossfade'],
};

export function findMockCatalogEntry(ref: AssetRef): MockCatalogEntry | undefined {
  return mockCatalog.find((entry) => entry.ref === ref);
}
