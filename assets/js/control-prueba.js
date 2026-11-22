import { getTestControl, sendControlOrder } from './api.js';
import { friendlyMessage } from './errors.js';
import { createJoystick } from './joystick.js';
import { setAction } from './ui.js';

const DETENER = 9;
const DIRECCIONES = {
  'joystick-move': { up: 1, down: 2, left: 4, right: 3 },
  'joystick-tool': { up: 5, down: 6, left: 10, right: 11 },
};
const BOTONES = { velocidad: 12, sonido: 13, luz: 15 };
const NOMBRES = {
  1: 'Avanzar', 2: 'Retroceder', 3: 'Girar a la derecha', 4: 'Girar a la izquierda',
  5: 'Subir brazo', 6: 'Bajar brazo', 9: 'DETENER', 10: 'Diagonal izquierda', 11: 'Diagonal derecha',
  12: 'Velocidad', 13: 'Sonido', 15: 'Luz',
};

export function initTestControl() {
  const status = document.getElementById('pulse-status');
  const stop = document.getElementById('btn-stop');
  const aux = [...document.querySelectorAll('#aux-controls [data-action]')];
  const joysticks = Object.entries(DIRECCIONES).map(([id, direcciones]) => {
    const root = document.getElementById(id);
    createJoystick(root, { onChange: (direccion) => { if (direccion) send(direcciones[direccion]); } });
    return { root, codigos: Object.values(direcciones) };
  });
  let unit = null;
  let visible = false;
  let link = null;
  let allowed = new Set();
  let timer;
  let selection = 0;
  let lastAction = 0;
  const pending = new Map();

  function renderButtons() {
    const usable = visible && link;
    stop.disabled = !usable || !allowed.has(DETENER) || pending.has('detener');
    for (const button of aux) {
      button.disabled = !usable || !allowed.has(BOTONES[button.dataset.action]) || pending.size !== 0;
    }
    for (const { root, codigos } of joysticks) root.inert = !usable || !codigos.some((codigo) => allowed.has(codigo));
  }

  async function refresh(current) {
    try {
      const { data } = await getTestControl(unit);
      if (current !== selection) return;
      link = data?.dispositivo_en_linea ? data.id_enlace : null;
      allowed = new Set(data?.codigos_habilitados ?? []);
      let message = 'Esperando conexión del ESP8266.';
      if (link) {
        message = 'ESP8266 autenticado y en línea.';
        if (!allowed.has(DETENER)) message += ' La unidad requiere un comando DETENER activo.';
        else if (!allowed.has(1)) message += ' Avanzar está deshabilitado para esta unidad.';
      }
      if (status.textContent !== message) status.textContent = message;
    } catch (error) {
      if (current !== selection) return;
      link = null;
      status.textContent = friendlyMessage(error);
    }
    renderButtons();
    timer = setTimeout(() => refresh(current), 6000);
  }

  function watch() {
    clearTimeout(timer);
    selection += 1;
    link = null;
    allowed.clear();
    renderButtons();
    if (!unit) status.textContent = 'Selecciona una unidad asignada.';
    else if (visible) {
      status.textContent = 'Consultando conexión del ESP8266…';
      refresh(selection);
    }
  }

  async function send(codigo) {
    if (!visible || !link) return;
    const isStop = codigo === DETENER;
    if (!allowed.has(codigo)) {
      if (pending.size === 0) setAction(`${NOMBRES[codigo]} no está habilitado para esta unidad.`, 'info');
      return;
    }
    if (isStop ? pending.has('detener') : pending.size !== 0) return;
    const operation = ++lastAction;
    const key = isStop ? 'detener' : 'movimiento';
    const idMovimiento = isStop ? pending.get('movimiento')?.idMovimiento ?? null : crypto.randomUUID();
    pending.set(key, { operation, idMovimiento });
    renderButtons();
    setAction(`${NOMBRES[codigo]} · esperando confirmación del ESP8266…`);
    try {
      const { data } = await sendControlOrder(unit, { codigo, id_enlace: link, id_movimiento: idMovimiento });
      if (operation !== lastAction) return;
      if (data?.orden_confirmada && data.detencion_confirmada) {
        setAction(isStop ? 'DETENER confirmado.' : `${NOMBRES[codigo]} y DETENER confirmados.`, 'ok');
      } else {
        setAction('La respuesta no confirmó la orden.', 'error');
      }
    } catch (error) {
      if (operation !== lastAction) return;
      setAction(error.kind === 'timeout'
        ? 'La API no confirmó la orden a tiempo. Revisa Monitoreo antes de repetirla.'
        : friendlyMessage(error), 'error');
    } finally {
      if (pending.get(key)?.operation === operation) {
        pending.delete(key);
        renderButtons();
      }
    }
  }

  for (const button of aux) {
    const codigo = BOTONES[button.dataset.action];
    if (!codigo) continue;
    button.classList.remove('is-on');
    button.removeAttribute('aria-pressed');
    button.setAttribute('aria-label', NOMBRES[codigo]);
    button.addEventListener('click', () => send(codigo));
  }
  stop.addEventListener('click', () => send(DETENER));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.repeat && visible) send(DETENER);
  });
  renderButtons();

  return {
    select(id) {
      if (unit === id) return;
      if (pending.has('movimiento')) send(DETENER);
      unit = id;
      lastAction += 1;
      pending.clear();
      setAction('Usa los mandos de la unidad seleccionada.');
      watch();
    },
    show(shown) {
      if (visible === shown) return;
      if (!shown && pending.has('movimiento')) send(DETENER);
      visible = shown;
      watch();
    },
  };
}
