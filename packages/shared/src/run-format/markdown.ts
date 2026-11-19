/**
 * Shape of the two Markdown files of a run. Both are owner-facing (pt-BR, D16), written by the
 * watcher through the atomic helper, and never parsed back as state: `plan.md` is an export of
 * run.json, `report.md` an output of the `package` stage.
 */

/** Level-2 headings `plan.md` contains, in this order, after its `# Plano — <title>` heading. */
export const planSections: readonly string[] = ['Fases e etapas', 'Versões fixadas', 'Estimativa de custo', 'Riscos'];

/** Level-2 headings `report.md` contains, in this order (PRD 7.4). */
export const reportSections: readonly string[] = [
  'O que foi feito',
  'Decisões',
  'O que saiu da máquina',
  'O que ouvir com atenção',
  'Avisos',
];

/** Required `## ` headings missing from a Markdown document, in the given order. */
export function missingSections(markdown: string, sections: readonly string[]): string[] {
  const headings = new Set(
    markdown
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).trim()),
  );
  return sections.filter((section) => !headings.has(section));
}
