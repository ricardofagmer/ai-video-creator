import { z } from 'zod';
import { CorrelationIdSchema } from '../common/ids';
import { COMPOSITION_CONFLICTS_MAX, CompositionConflictSchema } from '../recipes/composition-rules';

/**
 * Contract C10 (SPEC 0002, owner ticket R1-16): the api HTTP contract consumed by the web (R1-19,
 * R1-20). Browser-safe: zod only, no Node or Nest import. A change after freeze bumps this number
 * and goes back to its owner ticket. Revision 2 (SPEC 0002 rev 4, owner R1-24) adds `GET /watcher`,
 * the by-reference routes and the fields of section 13.2; every addition is additive. Revision 3
 * (SPEC 0003 section 4.3, owner R2-01) adds the R2 routes and fields and makes one **breaking**
 * change: `PUT .../status` refuses `active` with 422 `promotion-approval-required`. Revision 4
 * (SPEC 0005 section 4.4, owner C5-01) adds the four curation routes; every addition is additive.
 * Revision 5 (SPEC 0006 section 4.4, owner R3-01) adds the publication, metrics and schedule routes
 * and the fields `qualityPlatformSampleSize` (also on a comparison's `comparedVersionScore`),
 * `platformSampleSizeAtApproval`, `schedule` and `publicationCount`; every addition is additive.
 * Revision 6 (PRD 0001 R4 goal 4) adds `GET /insights`; it is additive.
 * Revision 7 (SPEC 0007 section 4.4, owner R4-01) adds the platform connection, gate and publish
 * routes, `apiRev7ErrorReasons`, and the optional fields `origin`, `attemptId` and `polling` on a
 * publication and `origin` on a snapshot; every addition is additive and a rev 6 body still parses.
 */
export const API_CONTRACT_REVISION = 7;

/** Request header the api copies into `correlationId`; echoed on every response. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** httpOnly, `SameSite=Lax` session cookie set by `POST /auth/login` (D8). */
export const SESSION_COOKIE_NAME = 'studio_session';

/** Stable error taxonomy (rules/observability.md); clients switch on `code` and `reason`. */
export const ApiErrorCodeSchema = z.enum(['validation', 'auth', 'not_found', 'conflict', 'rate_limited', 'dependency', 'internal']);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** One input problem: where, and either a zod issue code (request shape) or a domain message. */
export const ApiIssueSchema = z
  .object({
    path: z.string().max(200),
    code: z.string().max(64).optional(),
    message: z.string().max(500).optional(),
  })
  .strict();
export type ApiIssue = z.infer<typeof ApiIssueSchema>;

/**
 * Every error body. `reason` is the kebab-case name of the typed error (e.g. `asset-not-found`).
 * `message` never carries a file path, a query or a stack trace.
 */
export const ApiErrorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    code: ApiErrorCodeSchema,
    reason: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
    message: z.string().max(2000),
    correlationId: CorrelationIdSchema,
    details: z
      .object({
        issues: z.array(ApiIssueSchema).max(50).optional(),
        /** Required review checklist items left unchecked (`required-checklist-unchecked`). */
        itemIds: z.array(z.string().max(64)).max(20).optional(),
        /** Seconds until the next login attempt is accepted (`login-rate-limited`). */
        retryAfterSeconds: z.number().int().positive().optional(),
        /** The choices that cannot make one video together (`composition-conflict`, guided-creation spec). */
        conflicts: z.array(CompositionConflictSchema).max(COMPOSITION_CONFLICTS_MAX).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Rev 3 (SPEC 0003 section 4.3): the `ApiError.reason` values R2 adds, with their status codes.
 * No error body carries a note's text, a query, a promotion reason or a model file path.
 */
export const apiRev3ErrorReasons = Object.freeze({
  'promotion-approval-required': 422,
  'promotion-ref-mismatch': 422,
  'learning-ref-not-used': 422,
  'learning-contains-secret': 422,
  'learning-limit-reached': 422,
  'learning-biometric-refused': 422,
  'comparison-subject-invalid': 422,
  'comparison-biometric-refused': 422,
  'comparison-over-month-ceiling': 422,
  'comparison-estimate-changed': 409,
  'comparison-not-startable': 409,
  'learning-run-not-reviewed': 409,
  'embedding-unavailable': 503,
  'month-spend-unavailable': 503,
});

/**
 * Rev 4 (SPEC 0005 section 4.4): the `ApiError.reason` values the curation routes add, with their
 * status codes. `month-spend-unavailable` (503) is reused from rev 3, and `compare` passes the
 * comparison reasons through unchanged. No error body carries a body, focus, reason or diff text.
 */
export const apiRev4ErrorReasons = Object.freeze({
  'curation-subject-not-found': 404,
  'curation-not-found': 404,
  'curation-subject-not-curatable': 422,
  'curation-subject-biometric': 422,
  'curation-subject-deprecated': 422,
  'curation-subject-body-too-large': 422,
  'curation-no-reviewed-runs': 422,
  'curation-over-month-ceiling': 422,
  'curation-queue-full': 409,
  'curation-already-requested': 409,
  'curation-estimate-changed': 409,
  'curation-not-decidable': 409,
  'curation-already-decided': 409,
  'curation-not-saved': 409,
  'curation-subject-refused': 409,
});

/**
 * Rev 5 (SPEC 0006 section 4.4): the `ApiError.reason` values the publication, metrics and schedule
 * routes add, with their status codes. Nothing is written on a refusal. No error body carries a
 * URL, a cell, a file name or brief text. The owner-facing pt-BR texts are the web's, as for rev 4.
 */
export const apiRev5ErrorReasons = Object.freeze({
  'publication-run-not-approved': 409,
  'publication-url-not-recognized': 422,
  'publication-short-link-refused': 422,
  'publication-already-linked': 409,
  'publication-limit-reached': 422,
  'publication-has-metrics': 409,
  'publication-not-found': 404,
  'schedule-not-found': 404,
  'metrics-as-of-in-future': 422,
  'metrics-file-too-large': 413,
  'metrics-not-csv': 422,
  'metrics-too-many-rows': 422,
  'metrics-required-column-missing': 422,
  'metrics-empty-file': 422,
  'schedule-limit-reached': 422,
  'schedule-recipe-not-runnable': 422,
  'schedule-estimate-changed': 409,
  'schedule-time-invalid': 422,
  'schedule-not-editable': 409,
  'invalid-schedule-input': 422,
  'schedule-brief-change-refused': 409,
  'schedule-file-corrupt': 500,
  'invalid-metrics-input': 422,
  'metrics-snapshot-limit-reached': 422,
  'metrics-row-corrupt': 500,
});
export type ApiRev5ErrorReason = keyof typeof apiRev5ErrorReasons;

/**
 * Rev 7 (SPEC 0007 section 4.4): the `ApiError.reason` values the platform and publish routes add.
 * Nothing is written on a refusal. No error body carries a token, a code, a `state`, a URL, a
 * title, a caption, a tag, an account label or a platform's own error text.
 */
export const ApiRev7ErrorReasonSchema = z.enum([
  'platform-awaiting-review',
  'platform-publish-unsupported',
  'platform-not-configured',
  'platform-not-connected',
  'platform-needs-reconnect',
  'platform-mode-mismatch',
  'oauth-state-invalid',
  'oauth-denied',
  'oauth-exchange-failed',
  'oauth-scope-missing',
  'keychain-unavailable',
  'publish-run-not-approved',
  'publish-artifact-missing',
  'publish-artifact-changed',
  'publish-biometric-mismatch',
  'publish-sensitivity-unknown',
  'publish-already-in-progress',
  'publish-already-published',
  'publish-visibility-not-allowed',
  'publish-attempt-not-cancellable',
  'publish-idempotency-key-reused',
  'publish-attempt-not-found',
]);
export type ApiRev7ErrorReason = z.infer<typeof ApiRev7ErrorReasonSchema>;

/** The HTTP status of each rev 7 reason (section 4.4). */
export const apiRev7ErrorReasons: Readonly<Record<ApiRev7ErrorReason, number>> = Object.freeze({
  'platform-awaiting-review': 409,
  'platform-publish-unsupported': 409,
  'platform-not-configured': 409,
  'platform-not-connected': 409,
  'platform-needs-reconnect': 409,
  'platform-mode-mismatch': 409,
  'oauth-state-invalid': 400,
  'oauth-denied': 409,
  'oauth-exchange-failed': 502,
  'oauth-scope-missing': 409,
  'keychain-unavailable': 503,
  'publish-run-not-approved': 409,
  'publish-artifact-missing': 409,
  'publish-artifact-changed': 409,
  'publish-biometric-mismatch': 409,
  'publish-sensitivity-unknown': 409,
  'publish-already-in-progress': 409,
  'publish-already-published': 409,
  'publish-visibility-not-allowed': 422,
  'publish-attempt-not-cancellable': 409,
  'publish-idempotency-key-reused': 409,
  'publish-attempt-not-found': 404,
});

/**
 * The owner-facing pt-BR text of each rev 7 reason, verbatim from section 4.4, so the web and the
 * CLI show the same words. `{plataforma}` is the platform's display name and `{modo}` the account's
 * mode; the client fills them, the api never does.
 */
export const apiRev7ErrorTexts: Readonly<Record<ApiRev7ErrorReason, string>> = Object.freeze({
  'platform-awaiting-review': 'Aguardando revisão da plataforma. Use a importação por CSV ou o formulário enquanto isso.',
  'platform-publish-unsupported': 'O estúdio não publica em {plataforma}. Publique no aplicativo e cole o link da publicação.',
  'platform-not-configured': 'Falta configurar o aplicativo de {plataforma}. Rode `studio secrets set` com as credenciais do aplicativo.',
  'platform-not-connected': 'Conecte a sua conta de {plataforma} primeiro.',
  'platform-needs-reconnect': 'A conexão com {plataforma} expirou ou foi revogada. Conecte de novo.',
  'platform-mode-mismatch': 'A conta foi conectada em modo {modo} e o estúdio está em outro modo.',
  'oauth-state-invalid': 'Pedido de conexão inválido ou vencido. Comece de novo pela página Contas.',
  'oauth-denied': 'A conexão foi recusada em {plataforma}.',
  'oauth-exchange-failed': 'Não foi possível concluir a conexão com {plataforma}. Tente de novo.',
  'oauth-scope-missing': '{plataforma} não concedeu as permissões pedidas.',
  'keychain-unavailable': 'Não foi possível gravar no Keychain do macOS.',
  'publish-run-not-approved': 'Só é possível publicar uma execução aprovada.',
  'publish-artifact-missing': 'O vídeo final não foi encontrado.',
  'publish-artifact-changed': 'O vídeo final mudou depois da aprovação. Não foi enviado.',
  'publish-biometric-mismatch': 'A lista de ativos biométricos mudou. Confira e confirme de novo.',
  'publish-sensitivity-unknown': 'Não foi possível confirmar a sensibilidade de um ativo. Nada foi enviado.',
  'publish-already-in-progress': 'Já existe um envio em andamento para {plataforma}.',
  'publish-already-published': 'Esta execução já foi publicada em {plataforma}.',
  'publish-visibility-not-allowed': 'Essa visibilidade não existe em {plataforma}.',
  'publish-attempt-not-cancellable': 'O envio já começou e não pode ser cancelado.',
  'publish-idempotency-key-reused': 'Este pedido de publicação já foi enviado com outros dados. Abra o diálogo de novo e envie outra vez.',
  'publish-attempt-not-found': 'Não encontrado.',
});

/** rules/backend.md pagination: default 20, max 100. */
export const API_DEFAULT_PAGE_LIMIT = 20;
export const API_MAX_PAGE_LIMIT = 100;

/** A decimal query-string integer in `[min, max]`; query values always arrive as text. */
export function queryInteger(min: number, max: number): z.ZodType<number, string> {
  return z
    .string()
    .regex(/^[0-9]{1,16}$/, 'expected a decimal integer')
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => Number.isSafeInteger(value) && value >= min && value <= max, { message: `expected ${min}..${max}` });
}

/** A comma-separated query list whose items each satisfy `item` (e.g. `statuses=draft,active`). */
export function queryList<Item extends z.ZodType<unknown, string>>(item: Item, maxItems: number): z.ZodType<z.output<Item>[], string> {
  const items: z.ZodType<z.output<Item>[], string[]> = z.array(item).min(1).max(maxItems);
  return z
    .string()
    .max(1000)
    .transform((value) => value.split(',').map((part) => part.trim()))
    .pipe(items);
}

export const PageLimitQuerySchema = queryInteger(1, API_MAX_PAGE_LIMIT);

/** A page of a list endpoint; pass `nextCursor` back as `cursor`; null on the last page. */
export interface Page<Item> {
  items: Item[];
  /** Matching items in total, independent of the cursor. */
  total: number;
  nextCursor: string | null;
}

export function pageOf<Item extends z.ZodTypeAny>(item: Item): z.ZodType<Page<z.output<Item>>, unknown> {
  return z
    .object({
      items: z.array(item).max(API_MAX_PAGE_LIMIT),
      total: z.number().int().nonnegative(),
      nextCursor: z.string().max(64).nullable(),
    })
    .strict();
}
