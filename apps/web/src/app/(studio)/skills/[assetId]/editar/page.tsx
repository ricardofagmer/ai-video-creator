import type { Metadata } from 'next';
import { SkillEditView, loadNewestSkill } from '@/features/skills/views/SkillEditView';
import { getI18n } from '@/lib/i18n/server';

interface EditSkillPageProps {
  params: Promise<{ assetId: string }>;
}

export async function generateMetadata({ params }: EditSkillPageProps): Promise<Metadata> {
  const { assetId } = await params;
  const [skill, { t }] = await Promise.all([loadNewestSkill(assetId), getI18n()]);
  return { title: skill === null ? t.skills.edit.notFoundTitle : t.skills.edit.title(skill.name) };
}

/** `/skills/[assetId]/editar` opened directly (a reload or a shared link); from the Skills list it opens in the modal. */
export default async function EditSkillPage({ params }: EditSkillPageProps) {
  const { assetId } = await params;
  return <SkillEditView assetId={assetId} presentation="page" />;
}
