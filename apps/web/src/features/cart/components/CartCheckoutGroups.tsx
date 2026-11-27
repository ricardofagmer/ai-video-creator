'use client';

import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { type CompositionConflict } from '@studio/shared/recipes';
import { Icon, type IconName } from '@studio/ui';
import { type ReactElement, type ReactNode } from 'react';
import { CompositionConflictList } from '@/features/common/components/CompositionConflictList';
import { RunInstructionsField } from '@/features/runs/components/RunInstructionsField';
import { VoiceSampleButton } from '@/features/voices/components/VoiceSampleButton';
import { useWebMessages } from '@/lib/i18n/client';
import { cartDestinationOrder, cartDestinations, type CartDestination } from '../cart-bindings';
import { cartInstructionsActions, useCartInstructions } from '../cart-instructions-store';
import { type CartItem } from '../cart-store';
import styles from './CartButton.module.css';
import { CartSourceUrlField } from './CartSourceUrlField';
import { CartVideoPrompt } from './CartVideoPrompt';

type SectionTone = 'slot' | 'skill' | 'reference' | 'unused' | 'site' | 'instructions' | 'prompt';

const destinationLook: Record<CartDestination, { icon: IconName; tone: SectionTone }> = {
  slot: { icon: 'columns', tone: 'slot' },
  'writer-skill': { icon: 'sparkles', tone: 'skill' },
  reference: { icon: 'folder', tone: 'reference' },
  unused: { icon: 'help-circle', tone: 'unused' },
};

interface CartCheckoutGroupsProps {
  cart: readonly CartItem[];
  /** Choices that cannot make one video together; checkout lists them and blocks both recipe links. */
  conflicts: readonly CompositionConflict[];
  /** Id of the conflict list, which the disabled recipe buttons point at. */
  conflictListId: string;
}

/** Checkout body of the cart dialog: conflicts first, then where each item goes, the site, the instructions and the video prompt. */
export function CartCheckoutGroups({ cart, conflicts, conflictListId }: CartCheckoutGroupsProps): ReactElement {
  const t = useWebMessages();
  const texts = t.cart;
  const instructions = useCartInstructions();
  const destinations = cartDestinations(cart);
  return (
    <div className={styles.groups}>
      <header className={styles.checkoutHeader}>
        <span className={styles.sectionBadge} aria-hidden="true">
          <Icon name="cart" />
        </span>
        <h3 className={`overline ${styles.sectionTitle}`}>{texts.title}</h3>
        <span className={styles.sectionCount}>{texts.itemCount(cart.length)}</span>
      </header>
      <CompositionConflictList conflicts={conflicts} id={conflictListId} />
      {cartDestinationOrder.map((destination) => {
        const items = cart.filter((item) => destinations.get(item.ref) === destination);
        if (items.length === 0) return null;
        const look = destinationLook[destination];
        return (
          <CheckoutSection key={destination} icon={look.icon} tone={look.tone} title={texts.destinations[destination]} count={items.length} defaultOpen>
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
          </CheckoutSection>
        );
      })}
      <CheckoutSection icon="globe" tone="site" title={texts.site.card}>
        <CartSourceUrlField cart={cart} />
      </CheckoutSection>
      <CheckoutSection icon="clipboard" tone="instructions" title={t.runs.instructions.card}>
        <RunInstructionsField id="carrinho-instrucoes" value={instructions} onChange={(text) => cartInstructionsActions.set(text)} />
      </CheckoutSection>
      <CheckoutSection icon="sparkles" tone="prompt" title={texts.prompt.card} defaultOpen>
        <CartVideoPrompt cart={cart} />
      </CheckoutSection>
    </div>
  );
}

interface CheckoutSectionProps {
  icon: IconName;
  tone: SectionTone;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** One collapsible checkout section; the tone gives each section its own accent colour. */
function CheckoutSection({ icon, tone, title, count, defaultOpen = false, children }: CheckoutSectionProps): ReactElement {
  return (
    <details className={styles.section} data-tone={tone} open={defaultOpen}>
      <summary className={styles.sectionSummary}>
        <span className={styles.sectionBadge} aria-hidden="true">
          <Icon name={icon} />
        </span>
        <span className={`overline ${styles.sectionTitle}`}>{title}</span>
        {count !== undefined && <span className={styles.sectionCount}>{count}</span>}
        <span className={styles.sectionChevron} aria-hidden="true">
          <Icon name="chevron-down" />
        </span>
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
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
