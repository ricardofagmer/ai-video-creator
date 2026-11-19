/** Inline field errors of the upload form (design/telas/04 "Erros de campo", plus generic ones). */
export const formMessages = {
  required: 'Preencha este campo.',
  name: 'Preencha o nome.',
  assetId: 'Use só letras minúsculas, números e hífens.',
  url: 'Informe uma URL válida.',
  number: 'Informe um número válido.',
  json: 'JSON inválido.',
  invalid: 'Valor inválido.',
  tags: 'Use etiquetas em minúsculas, separadas por vírgula.',
  licenseUses: 'Escolha pelo menos um uso permitido.',
  origin: 'Escolha a origem.',
  aspect: 'A largura e a altura precisam formar 16:9, 9:16 ou 1:1.',
  path: 'Informe um caminho absoluto, começando com /, sem trechos "." ou ".." e sem barra no final.',
  biometricUpload: 'Material biométrico só entra por referência.',
  missingFile: 'Escolha um arquivo.',
};

/** Error map keyed by the field's element id, so the first invalid field can take focus. */
export type FieldErrors = Readonly<Record<string, string>>;
