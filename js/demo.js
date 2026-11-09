import { startDemo, cancelDemo } from './api.js';
import { getVehicleInfo, getDemos, isDemoRunning, setDemoRunning } from './state.js';
import { friendlyMessage } from './errors.js';
import * as ui from './ui.js';

// La DEMO la ejecuta y temporiza el backend (orden, duración y pausa). Aquí solo se
// consulta, se inicia, se cancela y se muestran los eventos que llegan por WebSocket.
let totalSteps = null;

function demoName(id) {
  return getDemos().find((d) => d.id_demo === id)?.nombre ?? `DEMO ${id}`;
}

function setRunning(running) {
  setDemoRunning(running);
  ui.updateDemoControls(running);
}

export async function startSelectedDemo() {
  const vehicle = getVehicleInfo();
  const demoId = Number(ui.getSelectedDemo());
  if (!vehicle || !demoId) return ui.setDemoStatus('Selecciona una DEMO.', 'error');
  if (isDemoRunning()) return ui.setDemoStatus('Ya hay una DEMO en ejecución.', 'error');
  const key = ui.getOperatorKey();
  if (!key) return ui.setDemoStatus('Escribe la clave de operador para ejecutar la DEMO.', 'error');

  setRunning(true); // bloquea un segundo clic mientras responde la API
  try {
    const result = await startDemo(vehicle.id, demoId, key);
    totalSteps = Number.isFinite(result.total_movimientos) ? result.total_movimientos : null;
    ui.setDemoStatus(`DEMO aceptada por la API (${totalSteps ?? '?'} movimientos). Esperando eventos…`, 'ok');
  } catch (err) {
    setRunning(false);
    ui.setDemoStatus(friendlyMessage(err), 'error');
  }
}

export async function cancelRunningDemo() {
  const vehicle = getVehicleInfo();
  if (!vehicle) return;
  const key = ui.getOperatorKey();
  if (!key) {
    ui.setDemoStatus('Para cancelar la DEMO escribe la clave de operador.', 'error');
    return;
  }
  try {
    await cancelDemo(vehicle.id, key);
    setRunning(false);
    ui.setDemoStatus('Cancelación aceptada por la API. Esperando el evento…', 'ok');
  } catch (err) {
    if (err.status === 404) {
      setRunning(false);
      ui.setDemoStatus('No hay una DEMO en ejecución.', 'info');
    } else {
      ui.setDemoStatus(friendlyMessage(err), 'error');
    }
  }
}

// Eventos del WebSocket: la fuente de verdad del estado de la DEMO.
export function onDemoEvent(msg) {
  switch (msg.evento) {
    case 'demo_inicio':
      totalSteps = Number.isFinite(msg.total_movimientos) ? msg.total_movimientos : totalSteps;
      setRunning(true);
      ui.setDemoStatus(`DEMO en ejecución: ${demoName(msg.id_demo)} (${totalSteps ?? '?'} movimientos).`, 'ok');
      break;
    case 'demo_movimiento':
      if (!isDemoRunning()) break; // un paso tardío no revive una DEMO ya cancelada o terminada
      ui.setDemoStatus(
        `DEMO en ejecución: paso ${Number.isFinite(msg.orden) ? msg.orden : '?'}${totalSteps ? ` de ${totalSteps}` : ''}` +
        `${typeof msg.comando === 'string' ? ` · ${msg.comando.slice(0, 40)}` : ''}`, 'ok');
      break;
    case 'demo_fin':
      setRunning(false);
      ui.setDemoStatus('DEMO finalizada (evento recibido).', 'ok');
      break;
    case 'demo_cancelada':
      setRunning(false);
      ui.setDemoStatus('DEMO cancelada (evento recibido).', 'ok');
      break;
    default:
  }
}
