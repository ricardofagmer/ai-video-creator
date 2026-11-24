import type { ReactNode } from 'react';
import { RememberSkillsLocation } from '@/features/skills/components/RememberSkillsLocation';

interface SkillsLayoutProps {
  children: ReactNode;
  /** Parallel route `@modal`: the skill form and the skill's catalog details, opened over the list. */
  modal: ReactNode;
}

export default function SkillsLayout({ children, modal }: SkillsLayoutProps) {
  return (
    <>
      <RememberSkillsLocation />
      {children}
      {modal}
    </>
  );
}
