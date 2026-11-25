import { AssetIdSchema } from '@studio/shared/catalog';
import { redirect } from 'next/navigation';
import { skillCategoryFrom } from '@/features/skills/skill-categories';
import { skillsHref } from '@/features/skills/skill-list';

interface SkillsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * `/skills` moved into the catalog (Catalog -> AI & writing -> Skills); old links and the forms' back
 * links land there with their category tab and saved notice. `?categoria=` and `?salvo=` are untrusted input.
 */
export default async function SkillsPage({ searchParams }: SkillsPageProps): Promise<never> {
  const parameters = await searchParams;
  const category = skillCategoryFrom(singleValue(parameters.categoria));
  const saved = singleValue(parameters.salvo);
  const savedAssetId = saved !== undefined && AssetIdSchema.safeParse(saved).success ? saved : undefined;
  redirect(skillsHref(category, savedAssetId));
}
