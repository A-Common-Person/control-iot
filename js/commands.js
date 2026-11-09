import { sendMovement } from './api.js';
import { findCommand, getVehicleInfo } from './state.js';
import { ApiError } from './errors.js';
import * as ui from './ui.js';

// Única vía de envío de comandos (botones y, después, los joysticks).
let sequence = 0;

export async function sendCommand(name) {
  const vehicle = getVehicleInfo();
  const command = findCommand(name);
  if (!vehicle || !command) {
    throw new ApiError(`El comando «${name}» no está disponible.`, { kind: 'app' });
  }

  const mine = ++sequence; // una respuesta tardía no pisa a una acción más reciente
  ui.setAction(`Solicitado: ${command.nombre}…`);
  const result = await sendMovement(vehicle.id, command.id_comando);
  if (mine === sequence) {
    ui.setAction(`Aceptado por la API: ${result.comando}. Falta el evento WebSocket.`, 'ok');
  }
  return result;
}