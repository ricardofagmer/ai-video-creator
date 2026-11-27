import { setupLabels } from '../../i18n/setup-labels';
import { type ShellLocale } from '../../i18n/locale';
import { MAX_PASSPHRASE_CHARS, MIN_PASSPHRASE_CHARS } from './setup-ipc';
import { button, element } from './setup-view';

/*
 * The passphrase form. The value is read once on submit, encoded to bytes for the IPC message and
 * both fields are cleared at once; it is never put in the DOM as text, logged or stored. The length
 * check here is only a convenience: the CLI's hasher is the authority and refuses with exit 2.
 */

export type PassphraseSubmission = { readonly kind: 'entered'; readonly secret: Uint8Array } | { readonly kind: 'cancelled' };

function passwordField(id: string, label: string): { readonly row: HTMLDivElement; readonly input: HTMLInputElement } {
  const row = element('div', undefined, 'field');
  const caption = element('label', label);
  caption.htmlFor = id;
  const input = element('input');
  input.id = id;
  input.type = 'password';
  input.autocomplete = 'new-password';
  input.required = true;
  input.maxLength = MAX_PASSPHRASE_CHARS;
  input.spellcheck = false;
  row.append(caption, input);
  return { row, input };
}

function problemOf(first: string, second: string, locale: ShellLocale): string | null {
  const labels = setupLabels[locale];
  const length = [...first].length;
  if (length < MIN_PASSPHRASE_CHARS) return labels.passphraseTooShort;
  if (length > MAX_PASSPHRASE_CHARS) return labels.passphraseTooLong;
  return first === second ? null : labels.passphraseMismatch;
}

export function renderPassphraseForm(target: HTMLElement, locale: ShellLocale, submit: (submission: PassphraseSubmission) => void): void {
  const labels = setupLabels[locale];
  const form = element('form', undefined, 'prompt');
  form.setAttribute('aria-labelledby', 'passphrase-heading');
  form.noValidate = true;
  const heading = element('h2', labels.passphraseHeading);
  heading.id = 'passphrase-heading';
  const hint = element('p', labels.passphraseHint);
  hint.id = 'passphrase-hint';
  const first = passwordField('passphrase', labels.passphraseLabel);
  const second = passwordField('passphrase-repeat', labels.passphraseRepeatLabel);
  first.input.setAttribute('aria-describedby', 'passphrase-hint');
  const problem = element('p', undefined, 'problem');
  problem.setAttribute('role', 'alert');
  const clear = (): void => {
    first.input.value = '';
    second.input.value = '';
  };
  const cancel = button(labels.passphraseCancel, () => {
    clear();
    submit({ kind: 'cancelled' });
  });
  const send = element('button', labels.passphraseSubmit, 'primary');
  send.type = 'submit';
  const row = element('div', undefined, 'actions');
  row.append(cancel, send);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = problemOf(first.input.value, second.input.value, locale);
    if (text !== null) {
      problem.textContent = text;
      first.input.setAttribute('aria-invalid', 'true');
      return;
    }
    const secret = new TextEncoder().encode(first.input.value);
    clear();
    submit({ kind: 'entered', secret });
  });
  form.append(heading, hint, first.row, second.row, problem, row);
  target.replaceChildren(form);
  first.input.focus();
}
