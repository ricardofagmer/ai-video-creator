import { ipcRenderer } from 'electron';
import { SETUP_MESSAGE_CHANNEL, SETUP_VIEW_CHANNEL, type SetupPrompt, type SetupWindowMessage, type SetupWindowView } from './setup-ipc';
import { renderPassphraseForm } from './setup-passphrase-form';
import { renderConsent, renderGatekeeperHelp, renderProgress } from './setup-view';

/*
 * Preload of the setup window (sandboxed, context-isolated; bundled to one file because a sandboxed
 * preload can require nothing but `electron`). It renders the view into `setup.html`, whose CSP
 * forbids every script, and talks to main over the two channels of `setup-ipc.ts`. Nothing is
 * exposed to the page's own world.
 */

function send(message: SetupWindowMessage): void {
  ipcRenderer.send(SETUP_MESSAGE_CHANNEL, message);
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Main is the only sender on this channel; the shape check keeps a malformed view from throwing mid-render. */
function isSetupWindowView(value: unknown): value is SetupWindowView {
  if (!isRecordObject(value)) return false;
  const { locale, prompt, progress } = value;
  const localeKnown = locale === 'pt-BR' || locale === 'es' || locale === 'en';
  const promptKnown = isRecordObject(prompt) && (prompt['kind'] === 'none' || prompt['kind'] === 'passphrase' || prompt['kind'] === 'consent');
  return localeKnown && promptKnown && (progress === null || isRecordObject(progress));
}

function promptKey(prompt: SetupPrompt): string {
  return prompt.kind === 'none' ? 'none' : `${prompt.kind}:${prompt.requestId}`;
}

function renderPrompt(target: HTMLElement, view: SetupWindowView): void {
  const { prompt, locale } = view;
  if (prompt.kind === 'none') {
    target.replaceChildren();
    return;
  }
  if (prompt.kind === 'passphrase') {
    renderPassphraseForm(target, locale, (submission) => {
      target.replaceChildren();
      if (submission.kind === 'cancelled') send({ kind: 'passphrase-cancelled', requestId: prompt.requestId });
      else send({ kind: 'passphrase', requestId: prompt.requestId, secret: submission.secret });
    });
    return;
  }
  renderConsent(target, prompt.offer, locale, (accepted) => {
    target.replaceChildren();
    send({ kind: 'consent', requestId: prompt.requestId, answer: accepted ? 'accepted' : 'declined' });
  });
}

function start(): void {
  const progressRegion = document.getElementById('progress');
  const promptRegion = document.getElementById('prompt');
  const helpRegion = document.getElementById('help');
  if (progressRegion === null || promptRegion === null || helpRegion === null) return;
  // The prompt is rebuilt only when a new question arrives, so progress updates never wipe what
  // the user is typing.
  let shownPrompt = '';
  ipcRenderer.on(SETUP_VIEW_CHANNEL, (_event, payload: unknown) => {
    if (!isSetupWindowView(payload)) return;
    document.documentElement.lang = payload.locale;
    renderProgress(progressRegion, payload, { retry: () => send({ kind: 'retry' }), close: () => send({ kind: 'close' }) });
    renderGatekeeperHelp(helpRegion, payload.locale);
    const key = promptKey(payload.prompt);
    if (key !== shownPrompt) {
      shownPrompt = key;
      renderPrompt(promptRegion, payload);
    }
  });
  send({ kind: 'ready' });
}

window.addEventListener('DOMContentLoaded', start, { once: true });
