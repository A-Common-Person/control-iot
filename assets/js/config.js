// Configuración pública. Aquí NUNCA van claves, tokens ni credenciales.
export const CONFIG = Object.freeze({
  API_BASE_URL: 'https://vehiculo-iot-erik.duckdns.org',
  WS_BASE_URL: 'wss://vehiculo-iot-erik.duckdns.org/ws/vehiculos',
  VEHICLE_ID: 1,
  HEALTH_PATH: '/health',
  HEALTH_INTERVAL_MS: 15000,
  REQUEST_TIMEOUT_MS: 8000,
  // Monitoreo
  HISTORY_LIMIT: 10,
  SYNC_DEBOUNCE_MS: 250,
  // La base de datos devuelve fecha_hora sin zona; se interpreta en esta zona ('UTC' o 'local').
  DB_NAIVE_TIME_ZONE: 'UTC',
  // Zona en la que se muestran fechas y horas.
  DISPLAY_TIME_ZONE: 'America/Mexico_City',
  // Clave de operador (X-API-Key): se envía siempre al iniciar y cancelar DEMO.
  // Decisión del autor para una práctica personal; no se muestra en la interfaz.
  OPERATOR_KEY: 'ITPgalletas8293',
});