import { sendMovement } from './api.js';
import { findCommand, getVehicleInfo, isDemoRunning } from './state.js';
import { ApiError, friendlyMessage } from './errors.js';
import * as ui from './ui.js';

// Única vía de envío de comandos: la usan los dos joysticks y los botones.
// Reglas: un solo control de movimiento activo, sin POST repetidos, DETENER con prioridad
// y una respuesta tardía nunca vuelve a "activar" el movimiento.
const STOP = 'DETENER';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let seq = 0;          // última acción pedida: solo ella actualiza el mensaje en pantalla
let busy = false;     // hay un POST de movimiento o botón en vuelo
let holder = null;    // control que mantiene el movimiento ('move' | 'tool')
let wanted = null;    // movimiento que el control mantenido desea ahora
let pending = null;   // último movimiento pedido mientras otro POST sigue en vuelo
let idleWaiters = [];

function markIdle() {
  busy = false;
  idleWaiters.splice(0).forEach((resolve) => resolve());
}
const waitIdle = () => (busy ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());

async function post(name, mine) {
  const vehicle = getVehicleInfo();
  const command = findCommand(name);
  if (!vehicle || !command) {
    throw new ApiError(`El comando «${name}» no está disponible.`, { kind: 'app' });
  }
  if (mine === seq) ui.setAction(`Solicitado: ${command.nombre}…`);
  const result = await sendMovement(vehicle.id, command.id_comando);
  if (mine === seq) ui.setAction(`Aceptado por la API: ${result.comando}. Falta el evento WebSocket.`, 'ok');
  return result;
}

async function runMovement(name) {
  busy = true;
  const mine = ++seq;
  try {
    await post(name, mine);
  } catch (err) {
    if (mine === seq) ui.setAction(friendlyMessage(err), 'error');
  } finally {
    if (pending && holder && pending === wanted) {
      const next = pending;
      pending = null;
      runMovement(next); // sigue ocupado: se envía solo lo más reciente
    } else {
      pending = null;
      markIdle();
    }
  }
}

async function postStop() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const mine = ++seq;
    try {
      await post(STOP, mine);
      return true;
    } catch (err) {
      const retryable = err.kind === 'network' || err.kind === 'timeout' || err.status >= 500;
      if (!retryable || attempt === 2) {
        ui.setAction(`No se pudo confirmar DETENER: ${friendlyMessage(err)}`, 'error');
        return false;
      }
      await sleep(400 * (attempt + 1));
    }
  }
  return false;
}

// DETENER: prioridad absoluta, no espera a otros envíos.
export async function requestStop() {
  holder = null;
  wanted = null;
  pending = null;
  const hadInFlight = busy;
  await postStop();
  if (hadInFlight) {
    // Si había un movimiento en vuelo, podría llegar al servidor después: se confirma la parada.
    await waitIdle();
    if (!holder) await postStop();
  }
}

// Movimiento mantenido (joysticks): se llama al cambiar de dirección.
export function beginHold(source, name) {
  if (isDemoRunning()) {
    ui.setAction('Hay una DEMO en ejecución. Cancélala o usa DETENER.', 'error');
    return false;
  }
  if (holder && holder !== source) {
    ui.setAction('Otro control de movimiento está activo. Suéltalo primero.', 'error');
    return false;
  }
  holder = source;
  if (wanted === name) return true;
  wanted = name;
  if (busy) pending = name;
  else runMovement(name);
  return true;
}

// Al soltar, perder el puntero o cancelar el gesto: vuelve al centro y solicita DETENER.
export function endHold(source) {
  if (holder !== source) return;
  requestStop();
}

// Botones de un toque (luz, sonido, velocidad, demo del carrito).
export async function requestToggle(name) {
  if (isDemoRunning()) {
    ui.setAction('Hay una DEMO en ejecución. Cancélala o usa DETENER.', 'error');
    return false;
  }
  if (holder || busy) {
    ui.setAction('Espera a que termine la acción en curso.', 'error');
    return false;
  }
  busy = true;
  const mine = ++seq;
  try {
    await post(name, mine);
    return true;
  } catch (err) {
    ui.setAction(friendlyMessage(err), 'error');
    return false;
  } finally {
    markIdle();
  }
}
