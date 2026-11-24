'use client';

import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { type CompositionConflict } from '@studio/shared/recipes';
import { type ReactElement } from 'react';
import { CompositionConflictList } from '@/features/common/components/CompositionConflictList';
import { RunInstructionsField } from '@/features/runs/components/RunInstructionsField';
import { VoiceSampleButton } from '@/features/voices/components/VoiceSampleButton';
import { useWebMessages } from '@/lib/i18n/client';
import { cartDestinations, type CartDestination } from '../cart-bindings';
import { cartInstructionsActions, useCartInstructions } from '../cart-instructions-store';
import { type CartItem } from '../cart-store';
import styles from './CartButton.module.css';
import { CartSourceUrlField } from './CartSourceUrlField';

const destinationOrder: readonly CartDestination[] = ['slot', 'writer-skill', 'reference', 'unused'];

interface CartCheckoutGroupsProps {
  cart: readonly CartItem[];
  /** Choices that cannot make one video together; checkout lists them and blocks both recipe links. */
  conflicts: readonly CompositionConflict[];
  /** Id of the conflict list, which the disabled recipe buttons point at. */
  conflictListId: string;
}

/** Checkout body of the cart dialog: conflicts first, then where each item goes, the site and the instructions. */
export function CartCheckoutGroups({ cart, conflicts, conflictListId }: CartCheckoutGroupsProps): ReactElement {
  const t = useWebMessages();
  const texts = t.cart;
  const instructions = useCartInstructions();
  const destinations = cartDestinations(cart);
  return (
    <div className={styles.groups}>
      <CompositionConflictList conflicts={conflicts} id={conflictListId} />
      {destinationOrder.map((destination) => {
        const items = cart.filter((item) => destinations.get(item.ref) === destination);
        if (items.length === 0) return null;
        return (
          <section key={destination} className={styles.group}>
            <h3 className="overline">
              {texts.destinations[destination]} · {items.length}
            </h3>
            <p className="caption">{texts.destinationHints[destination]}</p>
            <ul className={styles.compactList}>
              {items.map((item) => (
                <li key={item.ref} className={styles.compactItem}>
                  <span>{item.name}</span>
                  <span className={styles.compactAside}>
                    <span className="caption">{t.catalog.kinds[item.kind]}</span>
                    {item.voice === true && <CartVoiceSample item={item} />}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className={styles.group}>
        <h3 className="overline">{texts.site.card}</h3>
        <CartSourceUrlField cart={cart} />
      </section>
      <section className={styles.group}>
        <h3 className="overline">{t.runs.instructions.card}</h3>
        <RunInstructionsField id="carrinho-instrucoes" value={instructions} onChange={(text) => cartInstructionsActions.set(text)} />
      </section>
    </div>
  );
}

/** "Ouvir" on a voice row; a stored ref that no longer parses gets no button instead of a broken one. */
function CartVoiceSample({ item }: { item: CartItem }): ReactElement | null {
  const parsed = parseCartRef(item.ref);
  if (parsed === null) return null;
  return <VoiceSampleButton assetId={parsed.assetId} version={parsed.version} name={item.name} />;
}

// The cart lives in localStorage and may hold an edited value; such a row shows no sample button.
function parseCartRef(ref: string): { assetId: string; version: number } | null {
  return AssetRefSchema.safeParse(ref).success ? parseAssetRef(ref) : null;
}
