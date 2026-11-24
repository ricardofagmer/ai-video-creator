import type { Messages } from '@studio/ui';
import type { commonPtBR } from './pt-BR';

const UNREACHABLE = 'No fue posible comunicarse con el servicio local. Verifica con `studio doctor`.';
const FIELDS_REFUSED = 'Algunos campos no fueron aceptados.';
const CONTENT_TOO_LARGE = 'El archivo supera el límite de este tipo de activo.';

function inPlatform(platform: string | null): string {
  return `en ${platform ?? 'la plataforma'}`;
}

function ofPlatform(platform: string | null): string {
  return `de ${platform ?? 'la plataforma'}`;
}

function withPlatform(platform: string | null): string {
  return `con ${platform ?? 'la plataforma'}`;
}

function forPlatform(platform: string | null): string {
  return `a ${platform ?? 'la plataforma'}`;
}

export const commonEs: Messages<typeof commonPtBR> = {
  tagInput: {
    remove: (tag: string): string => `Quitar ${tag}`,
  },
  apiErrors: {
    unreachable: UNREACHABLE,
    requestContract: FIELDS_REFUSED,
    responseContract: 'El servicio local respondió con un formato inesperado. Verifica con `studio doctor`.',
    contentTooLarge: CONTENT_TOO_LARGE,
    status: (status, reason) => `Error ${status}${reason === null ? '' : ` (${reason})`}.`,
    unexpected: 'Ocurrió un error inesperado.',
    rev5Reasons: {
      'publication-run-not-approved': 'Solo se puede registrar la publicación de una ejecución aprobada.',
      'publication-url-not-recognized': 'Enlace no reconocido. Usa el enlace completo del video en YouTube, Instagram o TikTok.',
      'publication-short-link-refused': 'No se aceptan enlaces cortos. Abre el video y copia el enlace completo.',
      'publication-already-linked': 'Este video ya está vinculado a otra ejecución.',
      'publication-limit-reached': 'Límite de 5 publicaciones por ejecución.',
      'publication-has-metrics': 'Esta publicación ya tiene métricas y no se puede eliminar.',
      'publication-not-found': 'No encontrado.',
      'schedule-not-found': 'No encontrado.',
      'metrics-as-of-in-future': 'La fecha de las métricas no puede estar en el futuro.',
      'metrics-file-too-large': 'Archivo de más de 2 MB. Exporta un período más corto.',
      'metrics-not-csv': 'El archivo debe ser un CSV de texto (UTF-8). No se aceptan hojas de cálculo .xlsx ni archivos .zip.',
      'metrics-too-many-rows': 'El archivo tiene más de 5.000 filas. Exporta un período más corto.',
      'metrics-required-column-missing':
        'No encontré las columnas esperadas de la exportación de esta plataforma. Comprueba que elegiste la plataforma correcta.',
      'metrics-empty-file': 'El archivo no tiene filas de datos.',
      'schedule-limit-reached': 'Límite de 10 programaciones.',
      'schedule-recipe-not-runnable': 'La receta elegida no se puede ejecutar.',
      'schedule-estimate-changed': 'El costo máximo por ejecución cambió. Revisa el valor y confirma de nuevo.',
      'schedule-time-invalid': 'Fecha, hora o zona horaria no válida.',
      'schedule-not-editable': 'Esta programación fue eliminada.',
      'invalid-schedule-input': 'Datos de la programación no válidos. Revisa los campos e inténtalo de nuevo.',
      'schedule-brief-change-refused':
        'No fue posible cambiar la cola de briefs: un brief ya usado no se puede quitar, la cola necesita al menos uno y admite como máximo 50.',
      'schedule-file-corrupt': 'Los archivos de esta programación tienen un problema. Consulta `studio doctor`.',
      'invalid-metrics-input': 'Datos de las métricas no válidos. Revisa los campos e inténtalo de nuevo.',
      'metrics-snapshot-limit-reached': 'Límite de 400 registros de métricas para esta publicación.',
      'metrics-row-corrupt': 'Un registro de métricas guardado tiene un problema. Consulta `studio doctor`.',
    },
    guidedReasons: {
      'composition-conflict': 'Algunas elecciones no combinan en un mismo video. No se guardó ni se inició nada; revisa la lista y corrígela.',
      'asset-job-not-a-voice': 'Esta versión no es una voz, así que no tiene muestra.',
      'asset-job-not-a-video-reference': 'Solo las referencias de video pueden ser analizadas por la IA.',
      'asset-job-link-only': 'Esta referencia es solo un enlace. Adjunta el archivo del video para que la IA lo analice.',
      'asset-job-biometric-refused': 'La IA no trabaja con material biométrico.',
      'asset-job-queue-full': 'Ya hay 10 solicitudes en la cola. Espera a que termine una e inténtalo de nuevo.',
      'asset-job-sample-not-ready': 'La muestra todavía no está lista.',
    },
    reasons: {
      'asset-already-exists': 'Este id ya existe en el catálogo.',
      'recipe-already-exists': 'Este id de receta ya existe.',
      'asset-not-found': 'Activo no encontrado.',
      'asset-version-not-found': 'Versión del activo no encontrada.',
      'recipe-not-found': 'Receta no encontrada.',
      'recipe-version-not-found': 'Versión de la receta no encontrada.',
      'asset-version-conflict': 'El activo cambió mientras lo editabas. Inténtalo de nuevo.',
      'recipe-version-conflict': 'La receta cambió mientras la editabas. Inténtalo de nuevo.',
      'license-required': 'Un activo de terceros solo puede quedar activo con la licencia y la procedencia completadas.',
      'invalid-status-transition': 'Esta versión no puede cambiar a ese estado.',
      'invalid-recipe-status-transition': 'Esta versión de la receta no puede cambiar a ese estado.',
      'mime-type-not-allowed': 'Tipo de archivo no aceptado para este tipo de activo.',
      'layout-not-allowed': 'Este tipo de activo no acepta ese formato (archivo o carpeta).',
      'biometric-requires-reference': 'El material biométrico solo entra en el catálogo por referencia.',
      'biometric-downgrade': 'Este activo tiene material biométrico; las nuevas versiones siguen siendo biométricas.',
      'content-too-large': CONTENT_TOO_LARGE,
      'body-too-large': CONTENT_TOO_LARGE,
      'upload-rejected': 'El envío fue rechazado. Revisa el archivo e inténtalo de nuevo.',
      'unsafe-path': 'No se acepta un nombre de archivo de la carpeta.',
      'unsupported-folder': 'La carpeta no se puede importar.',
      'reference-path-refused':
        'La ruta no fue aceptada. Usa un archivo o carpeta que exista en tu carpeta personal o en /Volumes, fuera de la carpeta de datos del estudio, sin carpetas ocultas y sin accesos directos (enlaces simbólicos).',
      'source-not-found': 'No se encontró nada en esa ruta.',
      'recipe-binding-invalid': 'Un vínculo de la receta no corresponde a una versión del catálogo.',
      'invalid-asset-input': FIELDS_REFUSED,
      'invalid-recipe-input': FIELDS_REFUSED,
      'invalid-request': FIELDS_REFUSED,
      'promotion-approval-required': 'Una versión solo queda activa mediante la aprobación de promoción.',
      'promotion-ref-mismatch': 'La versión confirmada no es la versión de esta página. Recarga y confirma de nuevo.',
      'promotion-secret-scan-unavailable': 'No fue posible verificar el motivo contra secretos. No se registró nada; inténtalo de nuevo.',
      'invalid-promotion-input': 'El motivo o la evidencia no fueron aceptados. Se rechaza un motivo que parezca una contraseña o clave.',
      'learning-run-not-reviewed': 'Solo se puede guardar un aprendizaje de una ejecución que llegó a la revisión.',
      'learning-ref-not-used': 'Esta versión no se usó en esta ejecución.',
      'learning-biometric-refused': 'Los aprendizajes no se pueden guardar en material biométrico.',
      'learning-contains-secret': 'El texto parece contener una contraseña o clave. No se guardó nada; reescríbelo sin el secreto.',
      'learning-limit-reached': 'Esta versión ya tiene 20 aprendizajes activos. Retira uno antes de guardar otro.',
      'learning-secret-scan-unavailable': 'No fue posible verificar el texto contra secretos. No se guardó nada; inténtalo de nuevo.',
      'learning-note-not-found': 'Aprendizaje no encontrado.',
      'learning-already-retired': 'Este aprendizaje ya estaba retirado.',
      'invalid-learning-input': 'El texto del aprendizaje no fue aceptado. Usa de 1 a 500 caracteres.',
      'comparison-subject-invalid': 'La comparación no es válida: elige otra versión del mismo activo o de la misma receta.',
      'comparison-biometric-refused': 'No se permiten comparaciones con material biométrico.',
      'comparison-over-month-ceiling': 'Las dos ejecuciones superarían el tope de gasto del mes. No se inició nada.',
      'comparison-estimate-changed': 'El costo máximo cambió desde que se abrió la página. Revisa el nuevo valor antes de iniciar.',
      'comparison-not-startable': 'Esta comparación ya se inició o una de las ejecuciones ya no está en borrador.',
      'comparison-not-found': 'Comparación no encontrada.',
      'invalid-comparison-input': FIELDS_REFUSED,
      'month-spend-unavailable': 'No se pudo leer el gasto del mes, así que no se inició nada. Verifica con `studio doctor`.',
      'embedding-unavailable': 'La búsqueda por significado no está disponible: el modelo local no está listo. Verifica con `studio doctor`.',
      'invalid-semantic-search': 'La búsqueda no fue aceptada. Usa de 1 a 500 caracteres.',
      'curation-subject-not-found': 'Versión no encontrada. Recarga la página.',
      'curation-not-found': 'Propuesta del curador no encontrada.',
      'curation-subject-not-curatable': 'El curador solo hace propuestas para prompts, skills y recetas en borrador o activos.',
      'curation-subject-biometric': 'El curador no trabaja con material biométrico.',
      'curation-subject-deprecated': 'Una versión descontinuada no recibe propuestas del curador.',
      'curation-subject-body-too-large': 'El texto de esta versión supera los 16.000 caracteres, el límite del curador.',
      'curation-no-reviewed-runs': 'Esta versión todavía no tiene una ejecución con una decisión tuya. El curador necesita al menos una.',
      'curation-over-month-ceiling': 'La solicitud superaría el tope de gasto del mes. No se gastó nada.',
      'curation-queue-full': 'Ya hay 3 solicitudes en la cola del curador. Espera a que termine una y vuelve a pedir.',
      'curation-already-requested': 'Ya hay una solicitud para esta versión en la cola o en curso.',
      'curation-estimate-changed': 'El costo máximo cambió. Recarga la página y revisa el valor antes de volver a pedir.',
      'curation-not-decidable': 'Esta curaduría no tiene una propuesta para decidir.',
      'curation-already-decided': 'Esta propuesta ya fue decidida. Recarga la página.',
      'curation-not-saved': 'Guarda la propuesta como borrador antes de comparar. Cada propuesta tiene como máximo una comparación.',
      'curation-subject-refused': 'La versión de origen fue descontinuada o marcada como biométrica, así que la propuesta ya no se puede usar.',
      'curation-file-corrupt': 'Los archivos de esta curaduría están dañados. Pide una propuesta nueva; verifica con `studio doctor`.',
      'invalid-curation-input': FIELDS_REFUSED,
      'origin-not-allowed': 'La solicitud fue rechazada por seguridad. Recarga la página.',
      'api-unreachable': UNREACHABLE,
    },
  },
  platformErrors: {
    modes: {
      mock: 'simulado',
      live: 'real',
    },
    rev7Reasons: {
      'platform-awaiting-review': () => 'Esperando la revisión de la plataforma. Mientras tanto, usa la importación por CSV o el formulario.',
      'platform-publish-unsupported': ({ platform }) =>
        `El estudio no publica ${inPlatform(platform)}. Publica en la aplicación y pega el enlace de la publicación.`,
      'platform-not-configured': ({ platform }) =>
        `Falta configurar la aplicación ${ofPlatform(platform)}. Ejecuta \`studio secrets set\` con las credenciales de la aplicación.`,
      'platform-not-connected': ({ platform }) => `Conecta primero tu cuenta ${ofPlatform(platform)}.`,
      'platform-needs-reconnect': ({ platform }) => `La conexión ${withPlatform(platform)} venció o fue revocada. Conéctala de nuevo.`,
      'platform-mode-mismatch': ({ mode }) =>
        mode === null
          ? 'La cuenta se conectó y el estudio está en otro modo.'
          : `La cuenta se conectó en modo ${mode} y el estudio está en otro modo.`,
      'oauth-state-invalid': () => 'Solicitud de conexión no válida o vencida. Empieza de nuevo desde la página Cuentas.',
      'oauth-denied': ({ platform }) => `La conexión fue rechazada ${inPlatform(platform)}.`,
      'oauth-exchange-failed': ({ platform }) => `No fue posible completar la conexión ${withPlatform(platform)}. Inténtalo de nuevo.`,
      'oauth-scope-missing': ({ platform }) => `${platform ?? 'La plataforma'} no concedió los permisos solicitados.`,
      'keychain-unavailable': () => 'No fue posible guardar en el Llavero (Keychain) de macOS.',
      'publish-run-not-approved': () => 'Solo se puede publicar una ejecución aprobada.',
      'publish-artifact-missing': () => 'No se encontró el video final.',
      'publish-artifact-changed': () => 'El video final cambió después de la aprobación. No se envió.',
      'publish-biometric-mismatch': () => 'La lista de activos biométricos cambió. Revísala y confirma de nuevo.',
      'publish-sensitivity-unknown': () => 'No fue posible confirmar la sensibilidad de un activo. No se envió nada.',
      'publish-already-in-progress': ({ platform }) => `Ya hay un envío en curso ${forPlatform(platform)}.`,
      'publish-already-published': ({ platform }) => `Esta ejecución ya se publicó ${inPlatform(platform)}.`,
      'publish-visibility-not-allowed': ({ platform }) => `Esa visibilidad no existe ${inPlatform(platform)}.`,
      'publish-attempt-not-cancellable': () => 'El envío ya comenzó y no se puede cancelar.',
      'publish-idempotency-key-reused': () =>
        'Esta solicitud de publicación ya se envió con otros datos. Abre el diálogo de nuevo y envíala otra vez.',
      'publish-attempt-not-found': () => 'No encontrado.',
    },
  },
  compositionConflicts: {
    title: 'Estas elecciones no combinan en un mismo video',
    blockedHint: 'Mientras la lista tenga un elemento, el botón queda desactivado.',
    duplicateKind: {
      'ai-model': (count) => `Hay ${count} voces en el carrito, pero la receta usa solo una. Deja una.`,
      template: (count) => `Hay ${count} plantillas en el carrito. Elige una.`,
      'brand-kit': (count) => `Hay ${count} kits de marca en el carrito. Elige uno.`,
      music: (count) => `Hay ${count} músicas en el carrito. Elige una.`,
    },
    stageNeedsBinding: {
      narration: 'La narración está activada, pero la receta no tiene voz.',
      music: 'La música está activada, pero la receta no tiene pista.',
      composition: 'La composición está activada, pero la receta no tiene plantilla.',
    },
    formatMismatch: {
      aspect: (recipe, template) => `La receta es ${recipe} y la plantilla es ${template}.`,
      canvas: (recipe, template) => `La receta tiene ${recipe} píxeles y la plantilla tiene ${template}.`,
      fps: (recipe, template) => `La receta usa ${recipe} fps y la plantilla usa ${template} fps.`,
    },
    recipeRange: (range) =>
      `La plantilla acepta de ${range.templateMin} a ${range.templateMax} s; la receta pide de ${range.requestedMin} a ${range.requestedMax} s.`,
    runTarget: (range) => `La plantilla acepta de ${range.templateMin} a ${range.templateMax} s; el video pide ${range.requestedMax} s.`,
  },
  retry: 'Intentar de nuevo',
  cancel: 'Cancelar',
  notInformed: 'No informado',
  boundaries: {
    runs: { loading: 'Cargando las ejecuciones', error: 'No se pudieron cargar las ejecuciones' },
    run: { loading: 'Cargando la ejecución', error: 'No se pudo cargar la ejecución' },
    review: { loading: 'Cargando la revisión', error: 'No se pudo cargar la revisión' },
    catalog: { loading: 'Cargando el catálogo', error: 'No se pudo cargar el catálogo' },
    recipes: { loading: 'Cargando las recetas', error: 'No se pudieron cargar las recetas' },
    schedules: { loading: 'Cargando las programaciones', error: 'No se pudieron cargar las programaciones' },
    curations: { loading: 'Cargando la propuesta del curador', error: 'No se pudo cargar la propuesta del curador' },
    comparisons: { loading: 'Cargando las comparaciones', error: 'No se pudieron cargar las comparaciones' },
    insights: { loading: 'Calculando los indicadores', error: 'No se pudieron calcular los indicadores' },
    accounts: { loading: 'Cargando las cuentas', error: 'No se pudieron cargar las cuentas' },
  },
};
