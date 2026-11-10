// Configuración pública. Aquí NUNCA van claves, tokens ni credenciales.
export const CONFIG = Object.freeze({
  API_BASE_URL: 'https://vehiculo-iot-erik.duckdns.org',
  WS_BASE_URL: 'wss://vehiculo-iot-erik.duckdns.org/ws/vehiculos',
  VEHICLE_ID: 1,
  HEALTH_PATH: '/health',
  HEALTH_INTERVAL_MS: 15000,
  REQUEST_TIMEOUT_MS: 8000,
  // Clave de operador precargada por decisión del autor (práctica personal).
  // Para quitarla: dejar la cadena vacía ('') y volver a escribirla en el campo.
  OPERATOR_KEY: '',
});
