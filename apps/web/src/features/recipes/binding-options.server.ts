import 'server-only';
import { type Binding } from '@studio/shared/recipes';
import { formatAssetRef } from '@studio/shared/catalog';
import { serverStudioClient } from '@/lib/api/server';
import { type BindingOption } from './recipe-form-model';
import { editorKinds, slotSpecs } from './recipe-slots';

/**
 * Active catalog versions the editor may pin (design/telas/06: "só versões active"), plus the
 * base version's own pins so an unchanged slot keeps its exact ref and hash. Only names, refs and
 * hashes cross to the browser; biometric voice rows appear by name and ref, never by content.
 */
export async function loadBindingOptions(basePins: readonly Binding[]): Promise<BindingOption[]> {
  const page = await serverStudioClient().searchAssets({ kinds: editorKinds, statuses: ['active'], sensitivity: 'any', limit: 100 });
  const options: BindingOption[] = page.items.map((version) => {
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    return { ref, contentHash: version.contentHash, kind: version.kind, label: `${version.name} · ${ref}` };
  });
  for (const pin of basePins) {
    const spec = slotSpecs.find((candidate) => candidate.slot === pin.slot);
    if (spec === undefined || options.some((option) => option.ref === pin.ref)) continue;
    options.push({ ref: pin.ref, contentHash: pin.contentHash, kind: spec.kind, label: `${pin.ref} (versão fixada)` });
  }
  return options.sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
}
