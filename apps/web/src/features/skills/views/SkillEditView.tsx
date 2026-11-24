import { EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import { type AssetVersionView, type EntryFileView } from '@studio/shared/api';
import { AssetIdSchema } from '@studio/shared/catalog';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { CatalogModal } from '@/features/catalog/components/CatalogModal';
import layout from '@/features/common/layout.module.css';
import { SkillEditForm } from '@/features/skills/components/SkillEditForm';
import { ApiRequestError, isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

/** The api reason for `EntryFileUnavailableError` (catalog errors map their class name to a reason). */
const ENTRY_FILE_UNAVAILABLE_REASON = 'entry-file-unavailable';

/** The newest version of a skill; null when the id is malformed, unknown or not a skill. */
export async function loadNewestSkill(assetId: string): Promise<AssetVersionView | null> {
  if (!AssetIdSchema.safeParse(assetId).success) return null;
  try {
    const page = await serverStudioClient().listAssetVersions(assetId, { limit: 100 });
    const newest = page.items.reduce<AssetVersionView | null>(
      (best, version) => (best === null || version.version > best.version ? version : best),
      null,
    );
    return newest?.kind === 'skill' ? newest : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * The SKILL.md text of `skill`; null when the api refuses to offer it as text (a binary, oversized or
 * missing entry file). The form then shows a notice instead of the editor.
 */
async function loadEntryFile(skill: AssetVersionView): Promise<EntryFileView | null> {
  try {
    return await serverStudioClient().readEntryFile(skill.id, skill.version);
  } catch (error) {
    // Only the api's own refusal becomes the notice; an unreachable api or a bug still fails the page.
    if (error instanceof ApiRequestError && error.reason === ENTRY_FILE_UNAVAILABLE_REASON) return null;
    throw error;
  }
}

interface SkillEditViewProps {
  assetId: string;
  /** `page` for a direct link or reload; `modal` when opened from the Skills list. */
  presentation: 'page' | 'modal';
}

/**
 * `/skills/[assetId]/editar`: the edit starts from the newest version, so a second edit builds on the
 * first draft instead of the active version (docs/specs/2026-11-23-skills-page-design.md).
 */
export async function SkillEditView({ assetId, presentation }: SkillEditViewProps): Promise<ReactElement> {
  const [skill, { t }] = await Promise.all([loadNewestSkill(assetId), getI18n()]);
  const texts = t.skills;
  const inModal = presentation === 'modal';

  const content =
    skill === null ? (
      <EmptyState
        title={texts.edit.notFoundTitle}
        description={texts.edit.notFoundDescription}
        action={
          inModal ? undefined : (
            <Link href="/skills" className={buttonClassName({ variant: 'secondary' })}>
              {texts.newPage.backToList}
            </Link>
          )
        }
      />
    ) : (
      <div className={layout.page}>
        {!inModal && (
          <Link href="/skills" className={textLinkClassName()}>
            {texts.newPage.backToList}
          </Link>
        )}
        {inModal ? (
          // The dialog's own title already names the skill.
          <p className="caption">{texts.edit.description}</p>
        ) : (
          <PageHeader title={texts.edit.title(skill.name)} description={texts.edit.description} />
        )}
        <SkillEditForm base={skill} entryFile={await loadEntryFile(skill)} />
      </div>
    );

  if (!inModal) return content;
  return (
    <CatalogModal
      title={skill === null ? texts.edit.notFoundTitle : texts.edit.title(skill.name)}
      closeLabel={t.catalog.asset.closeModal}
      backLabel={texts.newPage.backToList}
      returnTo="skills"
    >
      {content}
    </CatalogModal>
  );
}
