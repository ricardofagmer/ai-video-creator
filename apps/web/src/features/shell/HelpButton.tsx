'use client';

import { Button, Card, Dialog, Icon, useI18n, type Locale } from '@studio/ui';
import Image from 'next/image';
import { useState, type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import styles from './HelpButton.module.css';

/** The exported Archify diagrams keep their own viewBox width per language; height is shared. */
const DIAGRAM_WIDTH: Record<Locale, number> = { en: 1134, es: 1148, 'pt-BR': 1158 };
const DIAGRAM_HEIGHT = 660;

/** Navbar "How to use" button: opens the usage flow diagram plus the everyday tips in a modal. */
export function HelpButton(): ReactElement {
  const t = useWebMessages();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const help = t.shell.help;
  const width = DIAGRAM_WIDTH[locale];

  function close(): void {
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={help.button}
        title={help.button}
      >
        <Icon name="help-circle" />
        <span className={styles.label}>{help.button}</span>
      </Button>
      <Dialog
        open={open}
        onClose={close}
        size="wide"
        title={help.title}
        description={help.description}
        headerAction={
          <Button variant="ghost" size="sm" onClick={close} aria-label={help.close} title={help.close}>
            <Icon name="close" />
          </Button>
        }
        footer={
          <Button variant="secondary" onClick={close}>
            {help.done}
          </Button>
        }
      >
        {/* Mounted only while open so the ~160 KB diagrams are not fetched on every studio page. */}
        {open ? (
          <>
            <figure className={styles.diagram}>
              <Image
                unoptimized
                className={styles.diagramLight}
                src={`/ajuda/como-usar-${locale}-light.svg`}
                width={width}
                height={DIAGRAM_HEIGHT}
                alt={help.diagramAlt}
              />
              <Image
                unoptimized
                className={styles.diagramDark}
                src={`/ajuda/como-usar-${locale}-dark.svg`}
                width={width}
                height={DIAGRAM_HEIGHT}
                alt={help.diagramAlt}
              />
            </figure>
            <div className={styles.tips}>
              {Object.values(help.tips).map((tip) => (
                <Card key={tip.title} as="h3" title={tip.title}>
                  <ul className={styles.tipList}>
                    {Object.values(tip.items).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
