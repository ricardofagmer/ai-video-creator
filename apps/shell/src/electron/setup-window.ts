import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import { setupLabels } from '../i18n/setup-labels';
import { type ShellLocale } from '../i18n/locale';
import {
  parseSetupWindowMessage,
  SETUP_MESSAGE_CHANNEL,
  SETUP_VIEW_CHANNEL,
  type SetupPrompt,
  type SetupWindowMessage,
  type SetupWindowView,
} from '../setup/window/setup-ipc';
import { SETUP_PAGE_URL } from './setup-protocol';
import { type ConsentAnswer, type DownloadOffer, type PassphraseAnswer, type SetupInteraction, type SetupProgress } from '../setup/setup-types';

/*
 * The setup window (ADR 0005 lines 143-144): a bundled local file only, contextIsolation on,
 * nodeIntegration off, sandbox on, no devtools. It is the shell's first BrowserWindow; ADR 0005
 * R3-AC-25.8 ("no window") needs the docs update this ticket reports. The window is also the
 * `SetupInteraction` port: a question opens it, and closing it answers "cancelled" / "declined".
 */

export interface SetupWindowFiles {
  /** `setup.html` beside the bundled main (`setup.css` beside it). */
  readonly html: string;
  /** Bundled `setup-preload.js`. */
  readonly preload: string;
}

export interface SetupWindowOptions {
  readonly locale: ShellLocale;
  readonly files: SetupWindowFiles;
  readonly onRetry: () => void;
}

type PendingQuestion =
  | { readonly kind: 'passphrase'; readonly requestId: number; readonly resolve: (answer: PassphraseAnswer) => void }
  | { readonly kind: 'consent'; readonly requestId: number; readonly offer: DownloadOffer; readonly resolve: (answer: ConsentAnswer) => void };

const WINDOW_WIDTH = 560;
const WINDOW_HEIGHT = 640;

export class SetupWindow implements SetupInteraction {
  private window: BrowserWindow | null = null;
  private progress: SetupProgress | null = null;
  private pending: PendingQuestion | null = null;
  private nextRequestId = 1;
  private readonly onMessage = (event: IpcMainEvent, payload: unknown): void => this.receive(event, payload);

  constructor(private readonly options: SetupWindowOptions) {}

  /** Opens the window, or brings it to the front. */
  show(): void {
    if (this.window !== null && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return;
    }
    this.window = this.createWindow();
  }

  isOpen(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  showProgress(progress: SetupProgress): void {
    this.progress = progress;
    this.push();
  }

  requestPassphrase(): Promise<PassphraseAnswer> {
    return new Promise<PassphraseAnswer>((resolve) => {
      this.ask({ kind: 'passphrase', requestId: this.takeRequestId(), resolve });
    });
  }

  requestConsent(offer: DownloadOffer): Promise<ConsentAnswer> {
    return new Promise<ConsentAnswer>((resolve) => {
      this.ask({ kind: 'consent', requestId: this.takeRequestId(), offer, resolve });
    });
  }

  private takeRequestId(): number {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return id;
  }

  private ask(question: PendingQuestion): void {
    // One question at a time; the orchestrator never asks two at once, so an older one is stale.
    this.settlePending();
    this.pending = question;
    this.show();
    this.push();
  }

  /** Answers the pending question with its negative answer: cancelled or declined. */
  private settlePending(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending?.kind === 'passphrase') pending.resolve({ kind: 'cancelled' });
    if (pending?.kind === 'consent') pending.resolve('declined');
  }

  private createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      title: setupLabels[this.options.locale].windowTitle,
      show: false,
      fullscreenable: false,
      webPreferences: {
        preload: this.options.files.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: false,
        spellcheck: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
      },
    });
    ipcMain.on(SETUP_MESSAGE_CHANNEL, this.onMessage);
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => {
      ipcMain.removeListener(SETUP_MESSAGE_CHANNEL, this.onMessage);
      this.window = null;
      this.settlePending();
    });
    window.loadURL(SETUP_PAGE_URL).catch(() => window.destroy());
    return window;
  }

  private view(): SetupWindowView {
    const pending = this.pending;
    let prompt: SetupPrompt = { kind: 'none' };
    if (pending?.kind === 'passphrase') prompt = { kind: 'passphrase', requestId: pending.requestId };
    if (pending?.kind === 'consent') prompt = { kind: 'consent', requestId: pending.requestId, offer: pending.offer };
    return { locale: this.options.locale, progress: this.progress, prompt };
  }

  private push(): void {
    const window = this.window;
    if (window === null || window.isDestroyed()) return;
    window.webContents.send(SETUP_VIEW_CHANNEL, this.view());
  }

  /** Only this window's own top frame may talk; anything else, or any malformed message, is dropped. */
  private receive(event: IpcMainEvent, payload: unknown): void {
    const window = this.window;
    if (window === null || window.isDestroyed() || event.sender !== window.webContents) return;
    if (event.senderFrame === null || event.senderFrame !== window.webContents.mainFrame) return;
    const message = parseSetupWindowMessage(payload);
    if (message !== null) this.handle(message, window);
  }

  private handle(message: SetupWindowMessage, window: BrowserWindow): void {
    const pending = this.pending;
    switch (message.kind) {
      case 'ready':
        this.push();
        return;
      case 'retry':
        this.options.onRetry();
        return;
      case 'close':
        window.close();
        return;
      case 'passphrase':
        if (pending?.kind !== 'passphrase' || pending.requestId !== message.requestId) {
          message.secret.fill(0);
          return;
        }
        this.pending = null;
        // Copied into a Buffer the passphrase step wipes after writing it to the CLI's stdin.
        pending.resolve({ kind: 'entered', secret: Buffer.from(message.secret) });
        message.secret.fill(0);
        this.push();
        return;
      case 'passphrase-cancelled':
      case 'consent':
        if (pending === null || pending.requestId !== message.requestId) return;
        if (message.kind === 'consent' && pending.kind === 'consent') {
          this.pending = null;
          pending.resolve(message.answer);
        } else if (message.kind === 'passphrase-cancelled' && pending.kind === 'passphrase') {
          this.pending = null;
          pending.resolve({ kind: 'cancelled' });
        }
        this.push();
        return;
    }
  }
}
