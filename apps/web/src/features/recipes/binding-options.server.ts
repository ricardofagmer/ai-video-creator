import 'server-only';
import { type AssetVersionView } from '@studio/shared/api';
import { type Binding } from '@studio/shared/recipes';
import { parseAssetRef } from '@studio/shared/catalog';
import { isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';
import { bindingOptionOf, compositionFactsOf } from './binding-option';
import { type BindingOption } from './recipe-form-model';
import { WRITER_SKILL_SLOT, editorKinds, slotSpecs } from './recipe-slots';

/**
 * Active catalog versions (and draft skills) the editor may pin (design/telas/06: "só versões active"), plus the
 * base version's own pins so an unchanged slot keeps its exact ref and hash. Only names, refs and
 * hashes cross to the browser; biometric voice rows appear by name and ref, never by content.
 * Template options also carry their details, which the editor checks the recipe's format against
 * (guided-creation spec section 3); voice options say they can be heard.
 */
export async function loadBindingOptions(basePins: readonly Binding[]): Promise<BindingOption[]> {
  const { t, locale } = await getI18n();
  const client = serverStudioClient();
  const [page, draftSkills] = await Promise.all([
    client.searchAssets({ kinds: editorKinds, statuses: ['active'], sensitivity: 'any', limit: 100 }),
    // The owner's skills usually stay drafts; the writer may still use them (2026-11-23 decision).
    client.searchAssets({ kinds: ['skill'], statuses: ['draft'], sensitivity: 'exclude-biometric', limit: 100 }),
  ]);
  const options: BindingOption[] = [...page.items, ...draftSkills.items].map(bindingOptionOf);
  const outsidePins = basePins.filter((pin) => !options.some((option) => option.ref === pin.ref));
  const pinVersions = await Promise.all(outsidePins.map((pin) => (pinNeedsDetails(pin) ? readPinVersion(pin) : Promise.resolve(null))));
  outsidePins.forEach((pin, index) => {
    const kind = pin.slot === WRITER_SKILL_SLOT ? 'skill' : slotSpecs.find((candidate) => candidate.slot === pin.slot)?.kind;
    if (kind === undefined || options.some((option) => option.ref === pin.ref)) return;
    const version = pinVersions[index] ?? null;
    options.push({
      ref: pin.ref,
      contentHash: pin.contentHash,
      kind,
      label: t.recipes.bindings.pinnedVersion(pin.ref),
      ...(version === null ? {} : compositionFactsOf(version)),
    });
  });
  return options.sort((left, right) => left.label.localeCompare(right.label, locale));
}

/** A kept pin that is no longer active: only the template and the voice slot need its details. */
function pinNeedsDetails(pin: Binding): boolean {
  return pin.slot === 'template' || pin.slot === 'voice';
}

async function readPinVersion(pin: Binding): Promise<AssetVersionView | null> {
  const { assetId, version } = parseAssetRef(pin.ref);
  try {
    return await serverStudioClient().getAssetVersion(assetId, version);
  } catch (error) {
    // A pin whose version was removed stays selectable by ref; its format just cannot be checked here (the api still checks on save).
    if (isNotFound(error)) return null;
    throw error;
  }
}
