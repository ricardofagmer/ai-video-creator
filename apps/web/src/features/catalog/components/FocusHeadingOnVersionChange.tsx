'use client';

import { useEffect, useRef } from 'react';

/**
 * design/telas/03, Acessibilidade: switching versions through `?versao=N` moves focus to the page
 * `<h1>`. The first render keeps the browser's own focus.
 */
export function FocusHeadingOnVersionChange({ version }: { version: number }): null {
  const previous = useRef(version);
  useEffect(() => {
    if (previous.current === version) return;
    previous.current = version;
    const heading = document.querySelector('main h1');
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [version]);
  return null;
}
