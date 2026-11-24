import { setupLabels, type SetupLabels } from '../../i18n/setup-labels';
import { type ShellLocale } from '../../i18n/locale';
import { type DownloadOffer, type OptionalComponentsReport, type SetupProgress, type StepReport } from '../setup-types';
import { type SetupWindowView } from './setup-ipc';

/*
 * Pure DOM rendering of the setup window, run in the preload's isolated world. Text only ever enters
 * the page through `textContent`, never as markup, and comes from the bundled labels or from the
 * closed id unions of the view; no value from the machine (path, output) is in a view at all.
 */

const BYTES_PER_MEGABYTE = 1_000_000;
const BYTES_PER_GIGABYTE = 1_000_000_000;

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}

export function button(text: string, onClick: () => void, primary = false): HTMLButtonElement {
  const node = element('button', text, primary ? 'primary' : undefined);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function formatSize(bytes: number, locale: ShellLocale): string {
  const gigabytes = bytes >= BYTES_PER_GIGABYTE;
  const format = new Intl.NumberFormat(locale, { style: 'unit', unit: gigabytes ? 'gigabyte' : 'megabyte', maximumFractionDigits: 1 });
  return format.format(bytes / (gigabytes ? BYTES_PER_GIGABYTE : BYTES_PER_MEGABYTE));
}

function stepItem(report: StepReport, labels: SetupLabels): HTMLLIElement {
  const item = element('li', undefined, `step step-${report.status}`);
  item.append(element('span', labels.steps[report.id], 'step-name'), element('span', labels.status[report.status], 'step-status'));
  if (report.status === 'warning' || report.status === 'failed') item.append(element('p', labels.reasons[report.reason], 'step-reason'));
  return item;
}

function componentsList(components: OptionalComponentsReport, labels: SetupLabels): HTMLUListElement {
  const list = element('ul', undefined, 'components');
  const entries: ReadonlyArray<readonly [string, string]> = [
    [labels.components['search-model'], components.searchModel],
    [labels.components['capture-browser'], components.captureBrowser],
  ];
  for (const [name, state] of entries) {
    list.append(element('li', `${name}: ${state === 'installed' ? labels.componentInstalled : labels.componentNotInstalled}`));
  }
  return list;
}

export interface ProgressActions {
  readonly retry: () => void;
  readonly close: () => void;
}

/** Heading, step list and the buttons of a finished, failed or refused run. */
export function renderProgress(target: HTMLElement, view: SetupWindowView, actions: ProgressActions): void {
  const labels = setupLabels[view.locale];
  const progress: SetupProgress | null = view.progress;
  target.replaceChildren();
  if (progress?.phase === 'refused') {
    target.append(element('h1', labels.refusedHeading), element('p', labels.refused[progress.problem]), element('p', labels.refusedAction));
    target.append(element('div', undefined, 'actions'));
    target.lastElementChild?.append(button(labels.close, actions.close, true));
    return;
  }
  const heading = progress?.phase === 'complete' ? labels.completeHeading : progress?.phase === 'failed' ? labels.failedHeading : labels.heading;
  target.append(element('h1', heading), element('p', labels.intro, 'intro'));
  const list = element('ol', undefined, 'steps');
  for (const report of progress?.steps ?? []) list.append(stepItem(report, labels));
  target.append(list);
  if (progress?.phase === 'complete') target.append(componentsList(progress.components, labels));
  if (progress?.phase === 'complete' || progress?.phase === 'failed') {
    const row = element('div', undefined, 'actions');
    if (progress.phase === 'failed') row.append(button(labels.retry, actions.retry, true));
    row.append(button(labels.close, actions.close, progress.phase === 'complete'));
    target.append(row);
  }
}

export function renderConsent(target: HTMLElement, offer: DownloadOffer, locale: ShellLocale, answer: (accepted: boolean) => void): void {
  const labels = setupLabels[locale];
  const section = element('section', undefined, 'prompt');
  section.setAttribute('aria-labelledby', 'consent-heading');
  const heading = element('h2', `${labels.consentHeading}: ${labels.components[offer.component]}`);
  heading.id = 'consent-heading';
  const details = element('dl');
  details.append(element('dt', labels.consentHost), element('dd', offer.host), element('dt', labels.consentSize), element('dd', formatSize(offer.sizeBytes, locale)));
  const row = element('div', undefined, 'actions');
  // Declining is the default button: a download only ever starts from a deliberate click.
  const decline = button(labels.consentDecline, () => answer(false), true);
  row.append(decline, button(labels.consentAccept, () => answer(true)));
  section.append(heading, element('p', labels.consentBody), details, row);
  target.replaceChildren(section);
  decline.focus();
}

export function renderGatekeeperHelp(target: HTMLElement, locale: ShellLocale): void {
  const labels = setupLabels[locale];
  target.replaceChildren(element('h2', labels.gatekeeperHeading), element('p', labels.gatekeeperHelp));
}
