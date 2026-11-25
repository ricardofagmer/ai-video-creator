'use client';

import { cartConflicts } from '@studio/shared/recipes';
import { Button, Dialog, Icon, buttonClassName, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { cartDestinations } from '../cart-bindings';
import { cartActions, useCart } from '../cart-store';
import styles from './CartButton.module.css';
import { CartCheckoutGroups } from './CartCheckoutGroups';
import { CartItemTile } from './CartItemTile';
import { CartKitBanner } from './CartKitBanner';
import { CART_PRESET_FORM_ID, CART_PRESET_INTENT, CartPresetForm, type CartPresetFormState } from './CartPresetForm';
import tileStyles from './CartItemTile.module.css';

type CartView = 'items' | 'checkout';

const CONFLICT_LIST_ID = 'carrinho-conflitos';

/** Navbar cart: the item count, and a dialog to review the items, check out and take them to a recipe. */
export function CartButton(): ReactElement {
  const t = useWebMessages();
  const texts = t.cart;
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CartView>('items');
  const checkout = view === 'checkout' && cart.length > 0;
  const destinations = cartDestinations(cart);
  // Two active voices (or templates, brand kits, songs) cannot make one video: no recipe from this cart.
  const conflicts = cartConflicts(cart);
  const [formState, setFormState] = useState<CartPresetFormState>('loading');
  const canSave = conflicts.length === 0 && formState === 'idle';

  function close(): void {
    setOpen(false);
    setView('items');
  }

  const itemsFooter =
    cart.length === 0 ? (
      <Button variant="secondary" onClick={close}>
        {texts.close}
      </Button>
    ) : (
      <>
        <Button variant="ghost" onClick={() => cartActions.clear()}>
          <Icon name="broom" size="sm" />
          <span>{texts.clear}</span>
        </Button>
        <Button variant="primary" onClick={() => setView('checkout')}>
          <span>{texts.checkout}</span>
          <Icon name="arrow-right" size="sm" />
        </Button>
      </>
    );

  const checkoutFooter = (
    <>
      <Button variant="ghost" onClick={() => setView('items')}>
        {texts.back}
      </Button>
      {conflicts.length > 0 ? (
        // Same look as the link, disabled, pointing at the conflict list that says why.
        <Button variant="ghost" disabled aria-describedby={CONFLICT_LIST_ID}>
          {texts.existingRecipe}
        </Button>
      ) : (
        <Link href="/receitas" onClick={close} className={buttonClassName({ variant: 'ghost' })}>
          {texts.existingRecipe}
        </Link>
      )}
      <Button
        type="submit"
        form={CART_PRESET_FORM_ID}
        data-intent={CART_PRESET_INTENT.save}
        variant="secondary"
        disabled={!canSave}
        aria-describedby={conflicts.length > 0 ? CONFLICT_LIST_ID : undefined}
      >
        {formState === 'saving' ? texts.preset.saving : texts.preset.save}
      </Button>
      <Button
        type="submit"
        form={CART_PRESET_FORM_ID}
        data-intent={CART_PRESET_INTENT.run}
        variant="primary"
        disabled={!canSave}
        aria-describedby={conflicts.length > 0 ? CONFLICT_LIST_ID : undefined}
      >
        <Icon name="plus" size="sm" />
        <span>{texts.preset.saveAndRun}</span>
      </Button>
    </>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={texts.buttonWithCount(cart.length)}
        title={texts.buttonWithCount(cart.length)}
      >
        <Icon name="cart" />
        <span className={styles.label}>{texts.button}</span>
        {cart.length > 0 && (
          <span className={styles.count} aria-hidden="true">
            {cart.length}
          </span>
        )}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={checkout ? texts.checkoutTitle : texts.title}
        // The items view says this inside its kit banner instead.
        description={checkout ? texts.checkoutDescription : undefined}
        headerAction={
          <Button variant="ghost" size="sm" onClick={close} aria-label={texts.closeHidden} title={texts.closeHidden}>
            <Icon name="close" />
          </Button>
        }
        footer={checkout ? checkoutFooter : itemsFooter}
        headerClassName={styles.dialogHeader}
        className={styles.dialog}
      >
        {!checkout && (
          <CartKitBanner
            eyebrow={texts.kitEyebrow}
            description={texts.description}
            facts={cart.length > 0 ? [texts.itemCount(cart.length)] : []}
          />
        )}
        {cart.length === 0 ? (
          <p className="body-sm">
            {texts.empty}{' '}
            <Link href="/catalogo" onClick={close} className={textLinkClassName()}>
              {texts.browseCatalog}
            </Link>
          </p>
        ) : checkout ? (
          <>
            <CartCheckoutGroups cart={cart} conflicts={conflicts} conflictListId={CONFLICT_LIST_ID} />
            <CartPresetForm cart={cart} onStateChange={setFormState} onDone={close} />
          </>
        ) : (
          <ul className={tileStyles.grid}>
            {cart.map((item) => (
              <CartItemTile key={item.ref} item={item} destination={destinations.get(item.ref)} onNavigate={close} />
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
