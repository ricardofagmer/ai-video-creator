'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './CardHoverPopover.module.css';

/** Wait before opening, so a pointer crossing the grid does not flash a popover on every card. */
const OPEN_DELAY_MS = 350;
/** Space between the card and the popover, and between the popover and the viewport edge. */
const GAP_PX = 12;

/** The element the popover follows: a poster card, or any element marked `data-preview-card`. */
const CARD_SELECTOR = 'article, [data-preview-card]';

export interface CardHoverPopoverProps {
  /** Popover width in px; the placement keeps this width inside the viewport. */
  width: number;
  /** Rendered only while the popover is open, so its media loads on the first hover and not before. */
  children: ReactNode;
}

type Placement = { left: number; top: number } | null;

/**
 * Catalog hover preview (2026-11-25): while the pointer or focus is on the card that holds this
 * component, a small popover opens beside the card. The popover is decorative (the card already
 * names the item), so it never takes focus and ignores the pointer.
 */
export function CardHoverPopover({ width, children }: CardHoverPopoverProps): ReactElement {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [card, setCard] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>(null);

  useEffect(() => {
    const found = anchorRef.current?.closest(CARD_SELECTOR);
    setCard(found instanceof HTMLElement ? found : null);
  }, []);

  useEffect(() => {
    if (card === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    };
    const hide = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      setOpen(false);
    };
    const leaveFocus = (event: FocusEvent): void => {
      if (!(event.relatedTarget instanceof Node) || !card.contains(event.relatedTarget)) hide();
    };
    card.addEventListener('mouseenter', show);
    card.addEventListener('mouseleave', hide);
    card.addEventListener('focusin', show);
    card.addEventListener('focusout', leaveFocus);
    window.addEventListener('scroll', hide, { passive: true });
    return () => {
      hide();
      card.removeEventListener('mouseenter', show);
      card.removeEventListener('mouseleave', hide);
      card.removeEventListener('focusin', show);
      card.removeEventListener('focusout', leaveFocus);
      window.removeEventListener('scroll', hide);
    };
  }, [card]);

  // Measured after mount, so the popover's real height keeps it inside the viewport.
  useLayoutEffect(() => {
    if (!open || card === null || popoverRef.current === null) {
      setPlacement(null);
      return;
    }
    setPlacement(placementBeside(card.getBoundingClientRect(), popoverRef.current.offsetHeight, width));
  }, [open, card, width]);

  const style: CSSProperties = placement === null ? { visibility: 'hidden', width } : { left: placement.left, top: placement.top, width };
  return (
    <>
      <span ref={anchorRef} hidden />
      {open &&
        createPortal(
          <div ref={popoverRef} className={styles.popover} style={style} aria-hidden="true">
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Right of the card when it fits, else left of it, else over the card; always inside the viewport. */
function placementBeside(rect: DOMRect, height: number, width: number): Placement {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const rightLeft = rect.right + GAP_PX;
  const leftLeft = rect.left - GAP_PX - width;
  const left =
    rightLeft + width + GAP_PX <= viewportWidth ? rightLeft : leftLeft >= GAP_PX ? leftLeft : Math.max(GAP_PX, rect.left + (rect.width - width) / 2);
  const maxTop = Math.max(GAP_PX, viewportHeight - height - GAP_PX);
  const top = Math.min(Math.max(rect.top, GAP_PX), maxTop);
  return { left, top };
}
