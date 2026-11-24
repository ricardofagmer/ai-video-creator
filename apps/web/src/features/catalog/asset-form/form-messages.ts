import { type WebMessages } from '@/messages';

/** Inline field errors of the upload form (design/telas/04 "Erros de campo"), from `t.catalog.form.errors`. */
export type FormErrorTexts = WebMessages['catalog']['form']['errors'];

/** Error map keyed by the field's element id, so the first invalid field can take focus. */
export type FieldErrors = Readonly<Record<string, string>>;
