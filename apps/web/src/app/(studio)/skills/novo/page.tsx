import { PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { SkillCreateForm } from '@/features/skills/components/SkillCreateForm';
import { SkillImportForm } from '@/features/skills/components/SkillImportForm';
import styles from '@/features/skills/skills.module.css';
import { getI18n } from '@/lib/i18n/server';

type SkillMode = 'importar' | 'criar';

interface NewSkillPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** `?modo=` is untrusted input: anything but `criar` opens the import form. */
async function modeOf(searchParams: NewSkillPageProps['searchParams']): Promise<SkillMode> {
  const { modo } = await searchParams;
  return modo === 'criar' ? 'criar' : 'importar';
}

export async function generateMetadata({ searchParams }: NewSkillPageProps): Promise<Metadata> {
  const [{ t }, mode] = await Promise.all([getI18n(), modeOf(searchParams)]);
  return { title: mode === 'criar' ? t.skills.newPage.createTitle : t.skills.newPage.importTitle };
}

/** `/skills/novo`: import a skill folder or write a new skill (docs/specs/2026-11-23-skills-page-design.md). */
export default async function NewSkillPage({ searchParams }: NewSkillPageProps) {
  const [{ t }, mode] = await Promise.all([getI18n(), modeOf(searchParams)]);
  const texts = t.skills.newPage;
  const modes: ReadonlyArray<{ value: SkillMode; label: string }> = [
    { value: 'importar', label: texts.modeImport },
    { value: 'criar', label: texts.modeCreate },
  ];

  return (
    <div className={layout.page}>
      <Link href="/skills" className={textLinkClassName()}>
        {texts.backToList}
      </Link>
      <PageHeader
        title={mode === 'criar' ? texts.createTitle : texts.importTitle}
        description={mode === 'criar' ? texts.createDescription : texts.importDescription}
      />
      <nav aria-label={texts.modesLabel} className={styles.modes}>
        {modes.map((item) => (
          <Link
            key={item.value}
            href={`/skills/novo?modo=${item.value}`}
            aria-current={item.value === mode ? 'page' : undefined}
            className={buttonClassName({ variant: item.value === mode ? 'primary' : 'secondary' })}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {mode === 'criar' ? <SkillCreateForm /> : <SkillImportForm />}
    </div>
  );
}
