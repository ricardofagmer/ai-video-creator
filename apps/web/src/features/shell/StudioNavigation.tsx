'use client';

import { DrawerSection, Icon, navLinkClassName, railLinkClassName } from '@studio/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { studioNavigationGroups } from './navigation-groups';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface StudioNavigationProps {
  /** `drawer` groups the links under headings; `rail` is the flat desktop column, icon over label. */
  variant?: 'drawer' | 'rail';
}

export function StudioNavigation({ variant = 'drawer' }: StudioNavigationProps): ReactElement {
  const t = useWebMessages();
  const pathname = usePathname();
  if (variant === 'rail') {
    return (
      <>
        {studioNavigationGroups.flatMap((group) =>
          group.links.map((link) => {
            const active = isActive(pathname, link.href);
            const label = t.shell.navigation[link.key];
            return (
              <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} title={label} className={railLinkClassName({ active })}>
                <Icon name={link.icon} />
                <span>{label}</span>
              </Link>
            );
          }),
        )}
      </>
    );
  }
  return (
    <>
      {studioNavigationGroups.map((group) => (
        <DrawerSection key={group.key} title={t.shell.navigationGroups[group.key]}>
          {group.links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={navLinkClassName({ active })}>
                <Icon name={link.icon} />
                <span>{t.shell.navigation[link.key]}</span>
              </Link>
            );
          })}
        </DrawerSection>
      ))}
    </>
  );
}
