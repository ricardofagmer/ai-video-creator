import { StatusBadge, Table, textLinkClassName, type TableColumn } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { qualityScoreText } from '@/features/quality/quality-labels';
import { getI18n } from '@/lib/i18n/server';

/** `?versoes=nota` sorts the table by score; `?versoes-com-nota=1` hides versions without one. */
export interface VersionScoresView {
  sortByScore: boolean;
  onlyScored: boolean;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export function versionScoresViewFrom(searchParams: SearchParams): VersionScoresView {
  return { sortByScore: searchParams.versoes === 'nota', onlyScored: searchParams['versoes-com-nota'] === '1' };
}

function viewHref(assetId: string, currentVersion: number, view: VersionScoresView): string {
  const parameters = new URLSearchParams({ versao: String(currentVersion) });
  if (view.sortByScore) parameters.set('versoes', 'nota');
  if (view.onlyScored) parameters.set('versoes-com-nota', '1');
  return `/catalogo/${encodeURIComponent(assetId)}?${parameters.toString()}`;
}

/** Highest score first, null scores last, ties by newer version (the api's quality order). */
function byScore(left: AssetVersionView, right: AssetVersionView): number {
  if (left.qualityScore === null || right.qualityScore === null) {
    if (left.qualityScore === right.qualityScore) return right.version - left.version;
    return left.qualityScore === null ? 1 : -1;
  }
  return right.qualityScore - left.qualityScore || right.version - left.version;
}

interface VersionScoresTableProps {
  versions: readonly AssetVersionView[];
  currentVersion: number;
  view: VersionScoresView;
}

/**
 * "Notas das versões" on the version page (SPEC 0003 section 2 item 1): every version's score with
 * its sample size, sortable by score and filterable to scored versions through plain links.
 */
export async function VersionScoresTable({ versions, currentVersion, view }: VersionScoresTableProps): Promise<ReactElement> {
  const { t, locale } = await getI18n();
  const texts = t.catalog.scores;
  const assetId = versions[0]?.id ?? '';
  const shown = versions.filter((version) => !view.onlyScored || version.qualityScore !== null);
  const rows = view.sortByScore ? [...shown].sort(byScore) : shown;
  const columns: readonly TableColumn<AssetVersionView>[] = [
    {
      key: 'version',
      header: texts.version,
      rowHeader: true,
      render: (version) =>
        version.version === currentVersion ? (
          <span className="mono">{texts.openVersion(version.version)}</span>
        ) : (
          <Link href={`/catalogo/${encodeURIComponent(version.id)}?versao=${version.version}`} className={textLinkClassName()}>
            <span className="mono">{`v${version.version}`}</span>
          </Link>
        ),
    },
    { key: 'status', header: texts.status, render: (version) => <StatusBadge kind="asset" status={version.status} /> },
    { key: 'score', header: texts.score, render: (version) => qualityScoreText(version, t.catalog.qualityText, locale) },
  ];
  return (
    <div className={layout.stack}>
      <nav aria-label={texts.navigationLabel} className={layout.row}>
        <Link
          href={viewHref(assetId, currentVersion, { ...view, sortByScore: !view.sortByScore })}
          className={textLinkClassName()}
        >
          {view.sortByScore ? texts.sortByVersion : texts.sortByScore}
        </Link>
        <Link
          href={viewHref(assetId, currentVersion, { ...view, onlyScored: !view.onlyScored })}
          className={textLinkClassName()}
        >
          {view.onlyScored ? texts.showAll : texts.onlyScored}
        </Link>
      </nav>
      <Table
        caption={texts.caption}
        columns={columns}
        rows={rows}
        rowKey={(version) => String(version.version)}
        emptyText={texts.empty}
      />
    </div>
  );
}
