import { getTestControl, sendTestControl } from './api.js';
import { friendlyMessage } from './errors.js';

export function initTestControl() {
  const status = document.getElementById('pulse-status');
  const feedback = document.getElementById('pulse-feedback');
  const forward = document.getElementById('pulse-forward');
  const stop = document.getElementById('pulse-stop');
  let unit = null;
  let visible = false;
  let online = false;
  let timer;
  let selection = 0;
  let lastAction = 0;
  const pending = new Map();

  function renderButtons() {
    forward.disabled = !online || pending.size !== 0;
    stop.disabled = !online || pending.has('detener');
  }

  async function refresh(current) {
    try {
      const { data } = await getTestControl(unit);
      if (current !== selection) return;
      online = data?.dispositivo_en_linea === true;
      const message = online ? 'ESP8266 autenticado y en línea.' : 'Esperando conexión del ESP8266.';
      if (status.textContent !== message) status.textContent = message;
    } catch (error) {
      if (current !== selection) return;
      online = false;
      status.textContent = friendlyMessage(error);
    }
    renderButtons();
    timer = setTimeout(() => refresh(current), 6000);
  }

  function watch() {
    clearTimeout(timer);
    selection += 1;
    online = false;
    renderButtons();
    if (!unit) status.textContent = 'Selecciona una unidad asignada.';
    else if (visible) {
      status.textContent = 'Consultando conexión del ESP8266…';
      refresh(selection);
    }
  }

  async function send(action) {
    const operation = ++lastAction;
    const selectedUnit = unit;
    pending.set(action, operation);
    renderButtons();
    feedback.dataset.level = '';
    feedback.textContent = 'Esperando confirmación del ESP8266…';
    try {
      const { data } = await sendTestControl(selectedUnit, action);
      if (operation !== lastAction) return;
      const confirmed = data?.detencion_confirmada && (action === 'detener' || data.avance_confirmado);
      feedback.dataset.level = confirmed ? 'ok' : 'error';
      feedback.textContent = confirmed
        ? (action === 'detener' ? 'DETENER confirmado.' : 'Pulso de avance y DETENER confirmados.')
        : 'La respuesta no confirmó la orden.';
    } catch (error) {
      if (operation !== lastAction) return;
      feedback.dataset.level = 'error';
      feedback.textContent = error.kind === 'timeout'
        ? 'La API no confirmó la orden a tiempo. Revisa Monitoreo antes de repetirla.'
        : friendlyMessage(error);
    } finally {
      if (pending.get(action) === operation) {
        pending.delete(action);
        renderButtons();
      }
    }
  }

  forward.addEventListener('click', () => { if (!forward.disabled) send('avanzar'); });
  stop.addEventListener('click', () => { if (!stop.disabled) send('detener'); });

  return {
    select(id) {
      if (unit === id) return;
      unit = id;
      lastAction += 1;
      pending.clear();
      feedback.textContent = '';
      watch();
    },
    show(shown) {
      if (visible === shown) return;
      visible = shown;
      watch();
    },
  };
}
