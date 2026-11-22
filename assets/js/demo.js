import { startDemo, cancelDemo, startAuthorizedDemo, cancelAuthorizedDemo } from './api.js';
import { getVehicleInfo, getDemos, isDemoRunning, setDemoRunning } from './state.js';
import { friendlyMessage } from './errors.js';
import { prettyName } from './utils.js';
import * as ui from './ui.js';

// La DEMO la ejecuta y temporiza el backend (orden, duración y pausa). Aquí solo se
// consulta, se inicia, se cancela y se muestran los eventos que llegan por WebSocket.
let totalSteps = null;

// En Administración, REST acepta la solicitud y los eventos de la unidad reportan la ejecución.
export function initAuthorizedDemo({ onActive }) {
  const picker = document.getElementById('demo-select');
  const start = document.getElementById('btn-demo-start');
  const cancel = document.getElementById('btn-demo-cancel');
  let unit = null;
  let link = null;
  let firmware = false;
  let wsOpen = false;
  let run = null;
  let cancelling = false;
  let revision = 0;
  let manualBusy = false;

  function render() {
    const active = Boolean(run) || cancelling;
    onActive(active);
    picker.disabled = active || picker.options.length < 2;
    start.disabled = active || manualBusy || !firmware || !link || !wsOpen || !picker.value;
    cancel.disabled = !run || cancelling;
  }

  function refreshCatalog() {
    const seleccionado = picker.value;
    ui.renderDemos(getDemos());
    if (Array.from(picker.options).some((option) => option.value === seleccionado)) picker.value = seleccionado;
    render();
  }

  function select(id) {
    revision += 1;
    unit = id;
    link = null;
    firmware = false;
    wsOpen = false;
    run = null;
    cancelling = false;
    ui.setDemoStatus('Sin demo en ejecución.');
    refreshCatalog();
  }

  function sync(data) {
    link = data?.id_enlace ?? null;
    const estabaDisponible = firmware;
    firmware = data?.demo_disponible === true;
    if (data?.id_ejecucion_demo && !run) {
      run = { id: data.id_ejecucion_demo, since: Date.now() };
      ui.setDemoStatus(`Demo en ejecución: ${demoName(data.id_demo_activa)}.`);
    } else if (data && !data.id_ejecucion_demo && run?.id && !cancelling && Date.now() - run.since > 2500) {
      run = null;
      ui.setDemoStatus('La API indica que la demo ya terminó.');
    } else if (link && !firmware && !run) {
      ui.setDemoStatus('Carga el sketch actualizado del ESP8266 para ejecutar demos.');
    } else if (firmware && !estabaDisponible && !run) {
      ui.setDemoStatus('Selecciona una demo para ejecutar.');
    }
    render();
  }

  start.addEventListener('click', async () => {
    if (start.disabled) return;
    const request = revision;
    const selected = Number(picker.value);
    const actual = { id: null, since: Date.now() };
    run = actual;
    ui.setDemoStatus('Solicitando ejecución…');
    render();
    try {
      const { data } = await startAuthorizedDemo(unit, selected, link);
      if (revision !== request || run !== actual) return;
      run.id = data.id_ejecucion;
      run.total ??= data.total_movimientos;
      if (!run.started && !cancelling) ui.setDemoStatus('Demo aceptada. Esperando el primer paso del ESP8266.');
    } catch (error) {
      if (revision !== request || run !== actual) return;
      if (error.kind === 'timeout' || error.kind === 'network') {
        ui.setDemoStatus('La API no confirmó la solicitud. Comprueba Monitoreo o pulsa Cancelar.', 'error');
        return;
      }
      run = null;
      ui.setDemoStatus(friendlyMessage(error), 'error');
    } finally {
      if (revision === request) render();
    }
  });

  async function stop() {
    if (!unit || !run || cancelling) return;
    const request = revision;
    cancelling = true;
    ui.setDemoStatus('Solicitando DETENER…');
    render();
    try {
      await cancelAuthorizedDemo(unit);
      if (revision !== request || !run) return;
      run = null;
      ui.setDemoStatus('Demo cancelada. El ESP8266 confirmó DETENER.', 'ok');
    } catch (error) {
      if (revision !== request || !run) return;
      if (error.status === 404) {
        ui.setDemoStatus('No hay una demo activa para cancelar.');
        run = null;
      } else ui.setDemoStatus(friendlyMessage(error), 'error');
    } finally {
      if (revision === request) {
        cancelling = false;
        render();
      }
    }
  }

  function onEvent(msg) {
    const id = msg.id_ejecucion;
    if (!id || msg.id_vehiculo !== unit) return;
    if (msg.evento === 'demo_inicio') {
      run ??= { since: Date.now() };
      run.id = id;
      run.started = true;
      run.total = msg.total_movimientos;
      if (!cancelling) ui.setDemoStatus(`Demo en ejecución: ${demoName(msg.id_demo)}.`, 'ok');
    } else if (msg.evento === 'demo_movimiento') {
      run ??= { id, since: Date.now() };
      if (run.id !== id) return;
      if (!cancelling) ui.setDemoStatus(`Paso ${msg.orden}${run.total ? ` de ${run.total}` : ''} · ${prettyName(msg.comando)}`, 'ok');
    } else if (['demo_fin', 'demo_cancelada', 'demo_error'].includes(msg.evento)) {
      if (run?.id && run.id !== id) return;
      run = null;
      if (msg.evento === 'demo_error') ui.setDemoStatus(msg.mensaje || 'La demo terminó por un error.', 'error');
      else ui.setDemoStatus(`${msg.evento === 'demo_fin' ? 'Demo finalizada.' : 'Demo cancelada.'} El ESP8266 confirmó DETENER.`, 'ok');
    }
    render();
  }

  cancel.addEventListener('click', stop);
  picker.addEventListener('change', render);
  return {
    select, sync, stop, onEvent, refreshCatalog,
    onWsState(state) { wsOpen = state === 'open'; render(); },
    onManualBusy(value) { if (value !== manualBusy) { manualBusy = value; render(); } },
  };
}

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
  if (!key) return ui.setDemoStatus('Ingresa la clave de operador para usar las demos del modo clásico.', 'error');

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
    ui.setDemoStatus('Ingresa la clave de operador para usar las demos del modo clásico.', 'error');
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
        `${typeof msg.comando === 'string' ? ` · ${prettyName(msg.comando.slice(0, 40))}` : ''}`, 'ok');
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