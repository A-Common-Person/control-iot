import { CONFIG } from './config.js';
import { ApiError, messageFromStatus } from './errors.js';

// Cliente REST: único lugar con URL base, encabezados, timeout y parseo JSON.
async function request(path, { method = 'GET', body, headers = {}, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('Tiempo de espera agotado.', { kind: 'timeout' });
    throw new ApiError('Error de red.', { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    if (response.ok) throw new ApiError('La API devolvió una respuesta no válida.', { kind: 'invalid', status: response.status });
  }

  if (!response.ok) {
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
  const { data } = await request(CONFIG.HEALTH_PATH, { timeoutMs: 5000 });
  return data;
}
