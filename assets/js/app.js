import { CONFIG } from './config.js';
import { getVehicle } from './api.js';
import { setVehicle, getDemos, findCommand, isDemoRunning, getToggle, flipToggle } from './state.js';
import { beginHold, endHold, requestStop, requestToggle, onMovementEvent } from './commands.js';
import { startSelectedDemo, cancelRunningDemo, onDemoEvent } from './demo.js';
import { createJoystick } from './joystick.js';
import { initRouter, getCurrentView } from './router.js';
import { initFullscreen } from './fullscreen.js';
import * as monitor from './monitor.js';
import { startWebSocket } from './websocket.js';
import { startHealthMonitor } from './health.js';
import { friendlyMessage } from './errors.js';
import { prettyName } from './utils.js';
import * as ui from './ui.js';

// Dirección del joystick -> nombre de comando del catálogo real de la API.
const MOVE_MAP = { up: 'Avanzar', down: 'RETROCEDER', left: 'GIRAR_A_IZQUIERDA', right: 'GIRAR_A_DERECHA' };
const TOOL_MAP = { up: 'SUBIR_BRAZO', down: 'BAJAR_BRAZO', left: 'DIAGONAL_IZQUIERDA', right: 'DIAGONAL_DERECHA' };

async function loadVehicle() {
  try {
    const data = await getVehicle(CONFIG.VEHICLE_ID);
    setVehicle(data);
    ui.setVehicleName(`${data.nombre} · ID ${data.id_vehiculo}`);
    ui.renderDemos(getDemos());
    ui.updateDemoControls(isDemoRunning());
    ui.markAvailableCommands(findCommand);
    ui.setAction('Catálogo cargado desde la API.', 'ok');
  } catch (err) {
    ui.setVehicleName('Vehículo no disponible');
    ui.setAction(friendlyMessage(err), 'error');
  }
}

function bindJoystick(elementId, source, map) {
  createJoystick(document.getElementById(elementId), {
    onChange(direction) {
      if (direction === null) return endHold(source);
      if (!findCommand(map[direction])) {
        ui.setAction(`El comando «${prettyName(map[direction])}» no está en el catálogo.`, 'error');
        return;
      }
      beginHold(source, map[direction]);
    },
  });
}

function bindAuxButtons() {
  ['luz', 'sonido'].forEach((action) => ui.renderToggle(action, getToggle(action)));
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      ui.setButtonState(btn, 'sending');
      btn.disabled = true;
      const action = btn.dataset.action;
      const ok = await requestToggle(action);
      if (ok && getToggle(action) !== undefined) ui.renderToggle(action, flipToggle(action));
      btn.disabled = false;
      ui.setButtonState(btn, ok ? 'idle' : 'error');
      if (!ok) setTimeout(() => ui.setButtonState(btn, 'idle'), 2000);
    });
  });
}

// DETENER: siempre envía el comando y, si hay una DEMO en marcha, también la cancela.
function emergencyStop() {
  const demoWasRunning = isDemoRunning();
  requestStop();
  if (demoWasRunning) cancelRunningDemo();
}

// Una sola sesión WSS compartida: cada evento llega a CONTROL y a MONITOREO.
function handleWsEvent(msg) {
  if (msg.id_vehiculo !== undefined && msg.id_vehiculo !== CONFIG.VEHICLE_ID) return; // otro vehículo
  ui.showWsEvent(msg);
  onMovementEvent(msg);
  onDemoEvent(msg);
  monitor.onWsEvent(msg);
}

function handleWsState(state) {
  ui.renderWsState(state);
  monitor.onWsState(state);
}

bindJoystick('joystick-move', 'move', MOVE_MAP);
bindJoystick('joystick-tool', 'tool', TOOL_MAP);
bindAuxButtons();

document.getElementById('btn-stop').addEventListener('click', emergencyStop);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && getCurrentView() === 'control') emergencyStop(); });
document.getElementById('demo-select').addEventListener('change', () => ui.updateDemoControls(isDemoRunning()));
document.getElementById('btn-demo-start').addEventListener('click', startSelectedDemo);
document.getElementById('btn-demo-cancel').addEventListener('click', cancelRunningDemo);

startWebSocket({ vehicleId: CONFIG.VEHICLE_ID, onState: handleWsState, onEvent: handleWsEvent });
startHealthMonitor({ onResult: ui.renderHealth });
loadVehicle();
initRouter({ onChange: monitor.onViewChange });
initFullscreen(document.getElementById('btn-fullscreen'));