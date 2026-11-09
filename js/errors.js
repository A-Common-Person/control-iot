// Errores de la aplicación y mensajes amigables. No se muestran trazas internas.
export class ApiError extends Error {
  constructor(message, { kind = 'http', status = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;     // 'network' | 'timeout' | 'http' | 'invalid' | 'app'
    this.status = status;
  }
}

const HTTP_MESSAGES = {
  401: 'Falta la clave de operador para esta acción.',
  403: 'La clave de operador no es válida.',
  404: 'El vehículo, el comando o la DEMO no existe.',
  409: 'La acción no se puede realizar en este momento.',
  422: 'Los datos enviados no son válidos.',
  503: 'La base de datos no está disponible.',
};

export function messageFromStatus(status, detail) {
  // El detalle del servidor es dato no confiable: se recorta y solo se muestra como texto.
  if (typeof detail === 'string' && detail.trim()) return detail.trim().slice(0, 160);
  return HTTP_MESSAGES[status] ?? `La API respondió con el código ${status}.`;
}

export function friendlyMessage(error) {
  if (error instanceof ApiError) {
    if (error.kind === 'timeout') return 'La API tardó demasiado en responder.';
    if (error.kind === 'network') return 'No se pudo conectar con la API. Revisa tu conexión.';
    return error.message;
  }
  return 'Ocurrió un error inesperado.';
}
