import { type AssetVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { isVoiceVersion } from '@/features/voices/voice-asset';
import { type BindingOption } from './recipe-form-model';

/** The parts of a version the editor's composition rules and "Ouvir" need; nothing else of its content. */
export function compositionFactsOf(version: AssetVersionView): Pick<BindingOption, 'templateDetails' | 'voice'> {
  if (version.kind === 'template') return { templateDetails: version.details };
  return isVoiceVersion(version) ? { voice: true } : {};
}

/** One catalog version as a pin the preset may hold: name, ref and hash only cross to the browser. */
export function bindingOptionOf(version: AssetVersionView): BindingOption {
  const ref = formatAssetRef({ assetId: version.id, version: version.version });
  return { ref, contentHash: version.contentHash, kind: version.kind, label: `${version.name} · ${ref}`, ...compositionFactsOf(version) };
}
