import { CONFIG } from './config.js';
import { ApiError, messageFromStatus } from './errors.js';

let session = null;

export function setSessionToken(token, onExpired) {
  session = token ? { token, onExpired } : null;
}

// Cliente REST: único lugar con URL base, encabezados, timeout y parseo JSON.
async function request(path, {
  method = 'GET', body, headers = {}, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS, auth = true,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const currentSession = auth ? session : null;
  let response;
  let data = null;
  try {
    response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(currentSession ? { Authorization: `Bearer ${currentSession.token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 204) return { status: response.status, data };
    try {
      data = await response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (response.ok) throw new ApiError('La API devolvió una respuesta no válida.', { kind: 'invalid', status: response.status });
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') throw new ApiError('Tiempo de espera agotado.', { kind: 'timeout' });
    throw new ApiError('Error de red.', { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 401 && currentSession && session === currentSession) currentSession.onExpired?.();
    throw new ApiError(messageFromStatus(response.status, data?.detail), { kind: 'http', status: response.status });
  }
  return { status: response.status, data };
}

const vid = (id) => encodeURIComponent(id);

export async function getVehicle(id) {
  const { data } = await request(`/vehiculos/${vid(id)}`);
  if (!data || !Array.isArray(data.comandos) || !Array.isArray(data.demos)) {
    throw new ApiError('La API devolvió un vehículo con formato inesperado.', { kind: 'invalid' });
  }
  return data;
}

export async function sendMovement(vehicleId, commandId) {
  const { data } = await request(`/vehiculos/${vid(vehicleId)}/movimientos`, {
    method: 'POST',
    body: { id_comando: commandId },
  });
  return data;
}

export async function startDemo(vehicleId, demoId, apiKey) {
  const { data } = await request(`/vehiculos/${vid(vehicleId)}/demos/${vid(demoId)}/iniciar`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
  });
  return data;
}

export async function cancelDemo(vehicleId, apiKey) {
  const { data } = await request(`/vehiculos/${vid(vehicleId)}/demos/cancelar`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
  });
  return data;
}

export async function getHealth() {
  const { data } = await request(CONFIG.HEALTH_PATH, { timeoutMs: 5000, auth: false });
  return data;
}

// ----- Monitoreo (solo lectura) -----
export async function getState(vehicleId) {
  const { data } = await request(`/vehiculos/${vid(vehicleId)}/estado`);
  if (data !== null && (typeof data !== 'object' || Array.isArray(data))) {
    throw new ApiError('La API devolvió un estado con formato inesperado.', { kind: 'invalid' });
  }
  return data; // null si el vehículo aún no tiene estado
}

export async function getHistory(vehicleId) {
  const { data } = await request(`/vehiculos/${vid(vehicleId)}/historial`);
  if (!Array.isArray(data)) {
    throw new ApiError('La API devolvió un historial con formato inesperado.', { kind: 'invalid' });
  }
  return data;
}

async function listar(path) {
  const { data } = await request(path);
  if (!Array.isArray(data)) throw new ApiError('La API devolvió una lista no válida.', { kind: 'invalid' });
  return data;
}

export async function login(correo, password) {
  const { data } = await request('/auth/login', { method: 'POST', body: { correo, password }, auth: false });
  if (!data?.access_token || !['administrador', 'usuario'].includes(data.usuario?.rol)) {
    throw new ApiError('La API devolvió una sesión no válida.', { kind: 'invalid' });
  }
  return data;
}

export const logout = () => request('/auth/logout', { method: 'POST' });
export const getMyVehicles = () => listar('/vehiculos/mios');
export const getTestControl = (id) => request(`/vehiculos/${vid(id)}/control/prueba`, { timeoutMs: 12000 });
export const sendControlOrder = (id, body) => request(`/vehiculos/${vid(id)}/control/orden`, {
  method: 'POST', body, timeoutMs: 20000,
});
const editorDemosPath = (unidad) => `/vehiculos/${vid(unidad)}/demos/editor`;
export const getDemoEditor = (unidad) => request(editorDemosPath(unidad));
export const getEditableDemo = (unidad, demo) => request(`${editorDemosPath(unidad)}/${vid(demo)}`);
export const saveEditableDemo = (unidad, demo, body) => (demo
  ? request(`${editorDemosPath(unidad)}/${vid(demo)}`, { method: 'PUT', body })
  : request(editorDemosPath(unidad), { method: 'POST', body }));
export const startAuthorizedDemo = (unit, demo, link) => request(`/vehiculos/${vid(unit)}/demos/${vid(demo)}/iniciar`, {
  method: 'POST', body: { id_enlace: link }, timeoutMs: 12000,
});
export const cancelAuthorizedDemo = (unit) => request(`/vehiculos/${vid(unit)}/demos/cancelar`, {
  method: 'POST', timeoutMs: 20000,
});
export const getExhibition = () => request('/exhibicion/catalogo', { auth: false });
export const startGuestSession = (unit) => request(`/exhibicion/unidades/${vid(unit)}/sesiones`, {
  method: 'POST', auth: false,
});
export const endGuestSession = (token) => request('/exhibicion/sesion', {
  method: 'DELETE', auth: false, headers: { Authorization: `Bearer ${token}` },
});
export const saveGuestCapabilities = (id, codigos) => request(`/administracion/modelos/${vid(id)}/capacidades-invitado`, {
  method: 'PUT', body: { codigos },
});
export const getInventory = () => listar('/administracion/inventario');
export const getModels = () => listar('/administracion/modelos');
export const getCapabilities = () => listar('/administracion/capacidades');
export const saveCapabilities = (id, codigos) => request(`/administracion/modelos/${vid(id)}/capacidades`, {
  method: 'PUT', body: { codigos },
});
export const createModel = (body) => request('/administracion/modelos', { method: 'POST', body });
export const saveModel = (id, body) => request(`/administracion/modelos/${vid(id)}`, { method: 'PUT', body });
export const createUnit = (body) => request('/administracion/unidades', { method: 'POST', body });
const rutaMovimientosModelo = (id) => `/administracion/unidades/${vid(id)}/movimientos-modelo`;
export const getMissingMovements = (id) => listar(rutaMovimientosModelo(id));
export const loadModelMovements = (id, id_modelo, codigos) => request(rutaMovimientosModelo(id), {
  method: 'PUT', body: { id_modelo, codigos },
});
export const saveUnit = (id, body) => request(`/administracion/unidades/${vid(id)}`, { method: 'PUT', body });
export const getCustomers = (offset) => listar(`/administracion/clientes?limite=100&desplazamiento=${offset}`);
export const getAudit = () => listar('/administracion/auditoria?limite=10');
export const createCustomer = (body) => request('/administracion/clientes', { method: 'POST', body });

export function assignVehicle(id, customerId, expected) {
  return request(`/administracion/unidades/${vid(id)}/asignacion`, {
    method: 'PUT',
    body: { id_usuario: customerId, id_asignacion_esperada: expected },
  });
}

export function releaseVehicle(id, expected) {
  return request(`/administracion/unidades/${vid(id)}/asignacion?id_asignacion_esperada=${vid(expected)}`, {
    method: 'DELETE',
  });
}
