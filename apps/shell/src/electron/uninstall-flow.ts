import { app, dialog, shell } from 'electron';
import { setupLabels, type UninstallLabels } from '../i18n/setup-labels';
import { type ShellLocale } from '../i18n/locale';
import { type SetupContext } from '../setup/setup-context';
import { runUninstall, type DataHomeDecision, type UninstallReport } from '../setup/uninstall';
import { writeOpenAtLogin } from './login-item';

/*
 * Uninstall from the menu (DI-AC-06), with native dialogs. Deleting the data home takes two separate
 * answers: the checkbox in the first dialog, then its own question whose default button keeps the
 * data. Anything short of both keeps it.
 */

const CONFIRM_BUTTON = 0;
const DELETE_DATA_BUTTON = 1;

async function confirmUninstall(labels: UninstallLabels): Promise<DataHomeDecision | 'cancelled'> {
  const first = await dialog.showMessageBox({
    type: 'warning',
    message: labels.message,
    detail: labels.detail,
    checkboxLabel: labels.deleteDataCheckbox,
    checkboxChecked: false,
    buttons: [labels.confirm, labels.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  if (first.response !== CONFIRM_BUTTON) return 'cancelled';
  if (!first.checkboxChecked) return 'keep-data';
  const second = await dialog.showMessageBox({
    type: 'warning',
    message: labels.deleteDataMessage,
    detail: labels.deleteDataDetail,
    buttons: [labels.deleteDataKeep, labels.deleteDataConfirm],
    defaultId: 0,
    cancelId: 0,
  });
  return second.response === DELETE_DATA_BUTTON ? 'delete-data' : 'keep-data';
}

async function reportResult(labels: UninstallLabels, report: UninstallReport): Promise<void> {
  if (report.failedParts.length > 0) {
    await dialog.showMessageBox({
      type: 'error',
      message: labels.partialMessage,
      detail: report.failedParts.map((part) => labels.parts[part]).join('\n'),
      buttons: [labels.ok],
    });
    return;
  }
  await dialog.showMessageBox({
    type: 'info',
    message: labels.finishedMessage,
    ...(report.dataHome === 'kept' ? { detail: labels.finishedKeptData } : {}),
    buttons: [labels.ok],
  });
}

/**
 * Asks, uninstalls and quits. `context` is a packaged setup context (its interaction is never used
 * here). Resolves without changing anything when the user cancels.
 */
export async function runUninstallFlow(context: SetupContext, locale: ShellLocale): Promise<void> {
  const labels = setupLabels[locale].uninstall;
  const decision = await confirmUninstall(labels);
  if (decision === 'cancelled') return;
  const report = await runUninstall(context, { disableLoginItem: () => writeOpenAtLogin(false), moveToTrash: (path) => shell.trashItem(path) }, decision);
  await reportResult(labels, report);
  app.quit();
}
