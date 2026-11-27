import type { Messages } from '@studio/ui';
import type { platformsPtBR } from './pt-BR';

export const platformsEs: Messages<typeof platformsPtBR> = {
  page: {
    title: 'Cuentas',
    description:
      'Tus cuentas de YouTube, Instagram y TikTok. Cada plataforma la habilitas tú, por separado, después de que apruebe la aplicación; el estudio solo publica cuando haces clic en Publicar en una ejecución aprobada.',
    loadFailed: (detail) => `No se pudieron cargar las cuentas. ${detail}`,
    platformCount: (count) => (count === 1 ? '1 plataforma' : `${count} plataformas`),
    connectedCount: (count) => (count === 1 ? '1 cuenta conectada' : `${count} cuentas conectadas`),
  },
  capabilityStatus: {
    unsupported: 'Publica en la aplicación y pega el enlace',
    'awaiting-review': 'Esperando la revisión de la plataforma',
    'not-configured': 'Aplicación no configurada',
    disconnected: 'Cuenta no conectada',
    'needs-reconnect': 'Vuelve a conectar la cuenta',
    connected: 'Conectada',
  },
  capabilities: {
    metrics: 'Métricas',
    publish: 'Publicación',
  },
  mockMode: 'Modo simulado: no se enviará nada.',
  mockBadge: 'simulado',
  importFallback: 'La importación por CSV y el formulario siguen disponibles.',
  importLink: 'Importar métricas desde un CSV',
  reconnectReasons: {
    'token-revoked': 'El permiso del estudio se revocó en la plataforma.',
    'refresh-expired': 'La autorización venció.',
    'scope-missing': 'La plataforma no concedió todos los permisos pedidos.',
    'account-changed': 'La cuenta de la plataforma cambió desde la conexión.',
    'token-missing': 'No se encontró la autorización guardada en el Keychain.',
  },
  backoffReasons: {
    'rate-limited': 'se alcanzó el límite de solicitudes',
    'quota-exhausted': 'cuota diaria agotada',
    'platform-unavailable': 'plataforma no disponible',
    network: 'sin conexión con la plataforma',
  },
  card: {
    account: 'Cuenta',
    noAccount: 'Ninguna cuenta conectada',
    connectedAt: 'Conectada el',
    lastPoll: 'Última recolección',
    backoff: 'Recolección en pausa',
    backoffValue: (reason, until) => `${reason}; se reintenta el ${until}`,
    publications: 'Publicaciones',
    tracked: (count) => (count === 1 ? '1 publicación seguida' : `${count} publicaciones seguidas`),
  },
  gate: {
    enable: (capability) => `Habilitar ${capability}`,
    enabledByYou: 'Habilitado por ti.',
    enableAfterReview: (platform) => `Actívalo solo después de que ${platform} apruebe la aplicación.`,
    confirmTitle: (capability, platform) => `¿Habilitar ${capability} en ${platform}?`,
    publishConsequence: (platform) => `El estudio podrá enviar videos a ${platform} cuando hagas clic en Publicar.`,
    metricsConsequence: (platform) =>
      `El estudio empezará a recolectar solo las métricas de tus publicaciones en ${platform}, dentro de la cuota gratuita de la plataforma.`,
    cancel: 'Cancelar',
    enabling: 'Habilitando…',
    confirm: 'Habilitar',
  },
  connection: {
    connecting: 'Abriendo la plataforma…',
    connect: 'Conectar',
    reconnect: 'Volver a conectar',
    disconnect: 'Desconectar',
    disconnectTitle: (platform) => `¿Desconectar ${platform}?`,
    disconnectDescription: (platform, fallback) =>
      `El estudio borra el acceso guardado en el Keychain y deja de recolectar métricas y de publicar en ${platform}. ${fallback}`,
    cancel: 'Cancelar',
    disconnecting: 'Desconectando…',
    revoked: (platform) => `Se borró el acceso guardado en el estudio y la cuenta de ${platform} confirmó que quitó el acceso de la aplicación.`,
    notRevoked: (platform) =>
      `Se borró el acceso guardado en el estudio. Para asegurarte, quita también el acceso de la aplicación en la configuración de tu cuenta de ${platform}.`,
    connected: 'Cuenta conectada.',
    connectedTo: (platform) => `Cuenta de ${platform} conectada.`,
    failed: 'No se pudo completar la conexión. Inténtalo de nuevo.',
  },
};
