// Configuración pública. Aquí NUNCA van claves, tokens ni credenciales.
const local = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
const origenPublico = 'https://a-common-person.github.io';
const apiPublica = 'https://vehiculo-iot-erik.duckdns.org';
const modo = new URLSearchParams(globalThis.location?.search).get('modo');
const administracionLocal = local && modo === 'administracion';
const administracionPublica = globalThis.location?.origin === origenPublico && modo !== 'clasico';
const apiBase = administracionLocal ? 'http://127.0.0.1:8001' : apiPublica;

export const CONFIG = Object.freeze({
  ADMINISTRACION: administracionLocal || administracionPublica,
  ADMINISTRACION_LOCAL: administracionLocal,
  API_BASE_URL: apiBase,
  WS_BASE_URL: `${apiBase.replace(/^http/, 'ws')}/ws/vehiculos`,
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
});
