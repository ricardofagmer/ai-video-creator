import type { Messages } from '@studio/ui';
import type { portalPtBR } from './pt-BR';

export const portalEs: Messages<typeof portalPtBR> = {
  header: {
    tagline: 'Descarga el studio y sigue su instalación en esta computadora.',
    languageLabel: 'Idioma',
  },
  detection: {
    heading: 'Studio en esta computadora',
    checking: 'Buscando el studio en esta computadora…',
    checkAgain: 'Verificar de nuevo',
    openStudio: 'Abrir el studio',
    loopbackBlocked: {
      title: 'Este navegador no deja que la página hable con el studio',
      body: 'Safari bloquea, por diseño, las solicitudes de una página web a las apps de esta computadora. No hay ningún error: abre el studio con el enlace de abajo, o usa Chrome, Edge o Firefox para ver aquí su versión y su estado.',
    },
    permissionPrompt: {
      title: 'Permite el acceso a las apps de esta computadora',
      body: 'El navegador pregunta si esta página puede hablar con apps de esta computadora. Elige Permitir para ver el estado del studio. La página solo habla con 127.0.0.1, la propia computadora.',
    },
    permissionDenied: {
      title: 'El acceso a las apps de esta computadora está bloqueado',
      body: 'Haz clic en el icono de configuración del sitio, a la izquierda de la dirección, cambia "Red de loopback" (o "Apps en este dispositivo") a Permitir y verifica de nuevo.',
    },
    notInstalled: {
      title: 'No se encontró el studio en esta computadora',
      body: 'Descarga el instalador de abajo. Si el studio ya está instalado, abre la app y verifica de nuevo. Si el navegador preguntó por apps de esta computadora, elige Permitir.',
    },
    unpaired: {
      title: 'Studio instalado',
      body: 'Para ver el estado de cada parte, conecta esta página: en el menú del studio, elige "Conectar al portal".',
      pairing: 'Conectando esta página al studio…',
      rejected: 'El código de conexión expiró o ya se usó. En el menú del studio, elige "Conectar al portal" otra vez.',
    },
    paired: {
      title: 'Studio instalado y conectado',
      waitingStatus: 'Leyendo el estado de cada parte…',
      componentsHeading: 'Partes del studio',
      setupPending: 'La configuración inicial aún no terminó. Abre el studio para completarla.',
    },
    unknownContract: {
      title: 'Actualiza el studio',
      body: 'El studio de esta computadora respondió en un formato que esta página no conoce. Descarga la versión más reciente abajo.',
    },
    facts: {
      version: 'Versión',
      platform: 'Plataforma',
      checkedAt: 'Verificado el',
    },
    components: {
      api: 'Servicio local',
      web: 'Interfaz',
      watcher: 'Ejecutor',
      database: 'Base de datos',
      ffmpeg: 'FFmpeg',
      searchModel: 'Modelo de búsqueda (opcional)',
      captureBrowser: 'Navegador de captura (opcional)',
      dataHome: 'Carpeta de datos',
    },
    componentStates: {
      ok: 'Funcionando',
      missing: 'Falta',
      stopped: 'Detenido',
      degraded: 'Con problemas',
      'not-installed': 'No instalado',
    },
    platforms: {
      'darwin-arm64': 'macOS (Apple Silicon)',
      'win32-x64': 'Windows (x64)',
    },
  },
  update: {
    title: 'Actualización disponible',
    body: (installed, latest) => `Tienes la versión ${installed}. La versión ${latest} está disponible.`,
    download: 'Descargar la actualización',
  },
  downloads: {
    heading: 'Descargar',
    loading: 'Leyendo la versión más reciente…',
    notConfigured: {
      title: 'Dirección de las versiones no configurada',
      body: 'Esta publicación del portal no sabe dónde leer la versión más reciente. Quien mantiene el portal debe definir la dirección del latest.json.',
    },
    failed: {
      title: 'No se pudo leer la versión más reciente',
      body: 'Inténtalo de nuevo en unos minutos.',
    },
    release: (version) => `Versión ${version}`,
    publishedAt: 'Publicada el',
    macos: {
      title: 'macOS',
      requirement: 'Para Mac con Apple Silicon (M1 o más reciente).',
      download: 'Descargar para macOS (.dmg)',
      notPublished: 'El instalador aún no se ha publicado. Este botón se activa cuando salga la primera versión.',
    },
    windows: {
      title: 'Windows',
      comingNext: 'Próximamente. La versión para Windows es la siguiente etapa.',
    },
    otherSystem: 'El studio funciona en computadoras Mac con Apple Silicon. Abre esta página en la computadora donde lo vas a instalar.',
    missingAsset: 'Esta versión no incluye instalador para esta plataforma.',
    size: 'Tamaño',
    file: 'Archivo',
    sha256: 'SHA-256',
    sha256Hint: 'Compruébalo en Terminal con: shasum -a 256 <archivo>',
    ffmpeg: {
      title: 'Código fuente de FFmpeg',
      body: (licence) => `El studio incluye FFmpeg, distribuido bajo la licencia ${licence}. El código fuente correspondiente acompaña cada versión.`,
      link: 'Descargar el código fuente de FFmpeg',
      missing: 'El código fuente de FFmpeg no aparece en esta versión.',
    },
    gatekeeper: {
      title: 'Primera apertura en Mac',
      intro: 'La app no está notarizada por Apple, así que macOS pide una confirmación la primera vez.',
      steps: {
        drag: 'Abre el archivo .dmg y arrastra la app a Aplicaciones.',
        firstOpen: 'Haz doble clic en la app en Aplicaciones. macOS no la abre: cierra el aviso sin elegir Trasladar a la Papelera.',
        settings: 'En menos de una hora, elige menú Apple > Ajustes del Sistema > Privacidad y seguridad (desplázate si hace falta). En Seguridad, haz clic en Abrir igualmente.',
        password: 'Escribe la contraseña de inicio de sesión y haz clic en Aceptar.',
        later: 'Las siguientes veces la app se abre sin preguntar.',
      },
    },
  },
  footer: {
    privacy: 'Esta página no usa cookies ni estadísticas. El estado del studio se lee de 127.0.0.1 y nunca sale de esta computadora.',
  },
};
