import { SkillEditView } from '@/features/skills/views/SkillEditView';

interface SkillEditModalProps {
  params: Promise<{ assetId: string }>;
}

/** `/skills/[assetId]/editar` reached from the Skills list: the same form, in a modal over the list. */
export default async function SkillEditModal({ params }: SkillEditModalProps) {
  const { assetId } = await params;
  return <SkillEditView assetId={assetId} presentation="modal" />;
}
