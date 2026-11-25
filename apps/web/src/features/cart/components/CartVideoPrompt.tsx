'use client';

import { Button, Textarea } from '@studio/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { EMPTY_CART_ASSET_CONTENTS, loadCartAssetContents, type CartAssetContents } from '../cart-asset-content';
import { cartDestinations } from '../cart-bindings';
import { useCartInstructions, useCartSourceUrl } from '../cart-instructions-store';
import { checkoutSourceUrlFrom, checkoutSourceUrlText } from '../cart-source-url';
import { type CartItem } from '../cart-store';
import { cartVideoPromptMarkdown } from '../cart-video-prompt';
import styles from './CartButton.module.css';

type CopyState = 'idle' | 'copied' | 'failed';
type ContentState = { status: 'loading' } | { status: 'ready'; contents: CartAssetContents };

interface CartVideoPromptProps {
  cart: readonly CartItem[];
}

/**
 * Checkout prompt: the cart with each asset's settings and prompt or skill text, the site and the
 * instructions as Markdown the owner copies or saves as a file.
 */
export function CartVideoPrompt({ cart }: CartVideoPromptProps): ReactElement {
  const t = useWebMessages();
  const texts = t.cart.prompt;
  const instructions = useCartInstructions();
  const typedSite = useCartSourceUrl();
  const [copy, setCopy] = useState<CopyState>('idle');
  const [content, setContent] = useState<ContentState>({ status: 'loading' });
  const cartKey = cart.map((item) => item.ref).join('|');

  useEffect(() => {
    let cancelled = false;
    setContent({ status: 'loading' });
    void loadCartAssetContents(cart).then((contents) => {
      if (!cancelled) setContent({ status: 'ready', contents });
    });
    return () => {
      cancelled = true;
    };
    // Reloaded only when the set of cart refs changes; a version's content never changes.
  }, [cartKey]);

  const contents = content.status === 'ready' ? content.contents : EMPTY_CART_ASSET_CONTENTS;
  const prompt = cartVideoPromptMarkdown({
    cart,
    destinations: cartDestinations(cart),
    contents: contents.byRef,
    sourceUrl: checkoutSourceUrlFrom(checkoutSourceUrlText(typedSite, cart)),
    instructions,
    texts,
    destinationTitles: t.cart.destinations,
    kindLabels: t.catalog.kinds,
  });
  const loading = content.status === 'loading';

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  function exportPrompt(): void {
    const url = URL.createObjectURL(new Blob([prompt], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = texts.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <p className="caption">{texts.help}</p>
      {loading && (
        <p className="caption" role="status">
          {texts.loading}
        </p>
      )}
      {contents.failed.length > 0 && (
        <p className="caption" role="alert">
          {texts.loadFailed(contents.failed.join(', '))}
        </p>
      )}
      <Textarea id="carrinho-prompt" aria-label={texts.card} aria-busy={loading} readOnly rows={12} value={prompt} className={styles.promptText} />
      <div className={styles.promptActions}>
        <Button variant="secondary" size="sm" disabled={loading} onClick={() => void copyPrompt()}>
          {texts.copy}
        </Button>
        <Button variant="secondary" size="sm" disabled={loading} onClick={exportPrompt}>
          {texts.exportFile}
        </Button>
        <span className="caption" role="status">
          {copy === 'copied' ? texts.copied : copy === 'failed' ? texts.copyFailed : ''}
        </span>
      </div>
    </>
  );
}
