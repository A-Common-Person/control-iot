import { getTestControl, sendControlOrder } from './api.js';
import { CONFIG } from './config.js';
import { friendlyMessage } from './errors.js';
import { createJoystick, DIRECCIONES } from './joystick.js';
import { setAction } from './ui.js';

const DETENER = 9;
const BOTONES = { velocidad: 12, sonido: 13, luz: 15 };
const NOMBRES = {
  1: 'Avanzar', 2: 'Retroceder', 3: 'Girar a la derecha', 4: 'Girar a la izquierda',
  5: 'Subir brazo', 6: 'Bajar brazo', 9: 'DETENER', 10: 'Diagonal izquierda', 11: 'Diagonal derecha',
  12: 'Velocidad', 13: 'Sonido', 15: 'Luz',
};

export function initTestControl({ onDemoState, onDemoStop, onManualBusy } = {}) {
  const status = document.getElementById('pulse-status');
  const stop = document.getElementById('btn-stop');
  const aux = [...document.querySelectorAll('#aux-controls [data-action]')];
  const joysticks = Object.entries(DIRECCIONES).map(([id, direcciones]) => {
    const root = document.getElementById(id);
    const joystick = createJoystick(root, { onChange: (direccion) => cambiarDireccion(id, direcciones[direccion]) });
    return { root, joystick, codigos: Object.values(direcciones) };
  });
  let unit = null;
  let visible = false;
  let link = null;
  let allowed = new Set();
  let timer;
  let selection = 0;
  let lastAction = 0;
  const pending = new Map();
  let token = null;
  let mantenido = false;
  let socket = null;
  let canalListo = false;
  let reintento;
  let direccion = null;
  let gesto = null;
  let demoActive = false;

  function renderButtons() {
    const usable = visible && link;
    stop.disabled = !demoActive && (!usable || !allowed.has(DETENER) || pending.has('detener'));
    for (const button of aux) {
      button.disabled = !usable || !allowed.has(BOTONES[button.dataset.action]) || pending.size !== 0 || !!gesto || demoActive;
    }
    for (const { root, codigos } of joysticks) {
      root.inert = demoActive || !usable || !mantenido || !canalListo || !codigos.some((codigo) => allowed.has(codigo));
    }
    onManualBusy?.(Boolean(gesto) || pending.size > 0);
  }

  async function refresh(current) {
    try {
      const { data } = await getTestControl(unit);
      if (current !== selection) return;
      link = data?.dispositivo_en_linea ? data.id_enlace : null;
      allowed = new Set(data?.codigos_habilitados ?? []);
      mantenido = data?.mantenido === true;
      onDemoState?.(data);
      if (gesto && (!link || gesto.enlace !== link || !allowed.has(direccion?.codigo))) {
        direccion = null;
        soltar();
      }
      let message = 'Esperando conexión del ESP8266.';
      if (link) {
        message = 'ESP8266 autenticado y en línea.';
        if (!allowed.has(DETENER)) message += ' La unidad requiere un comando DETENER activo.';
        else if (!mantenido) message += ' Carga el sketch actualizado para habilitar el joystick.';
      }
      if (status.textContent !== message) status.textContent = message;
    } catch (error) {
      if (current !== selection) return;
      const temporal = error.kind === 'timeout' || error.kind === 'network' || error.status >= 500;
      if (gesto && !gesto.soltando && canalListo && temporal) {
        status.textContent = 'Control activo. La consulta de estado está pendiente.';
      } else {
        link = null;
        direccion = null;
        soltar();
        status.textContent = friendlyMessage(error);
        onDemoState?.(null);
      }
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

  function transmitir(mensaje) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 2048) {
      socket.close();
      return false;
    }
    socket.send(JSON.stringify(mensaje));
    return true;
  }

  function abrirCanal() {
    if (!visible || !unit || !token || socket) return;
    const url = `${CONFIG.WS_BASE_URL.replace(/\/vehiculos$/, '/control')}/${encodeURIComponent(unit)}`;
    const canal = new WebSocket(url);
    socket = canal;
    canal.addEventListener('open', () => {
      if (socket === canal) transmitir({ tipo: 'autenticar', token });
    });
    canal.addEventListener('message', ({ data }) => {
      if (socket !== canal) return;
      let mensaje;
      try { mensaje = JSON.parse(data); } catch { canal.close(); return; }
      if (mensaje.tipo === 'listo') {
        canalListo = true;
        renderButtons();
        return;
      }
      if (!gesto || mensaje.id_gesto !== gesto.id) return;
      if (mensaje.tipo === 'movimiento_aplicado' && !gesto.soltando) {
        setAction(`${NOMBRES[mensaje.codigo]} · salida confirmada por el ESP8266.`, 'ok');
      } else if (mensaje.tipo === 'detencion_aplicada') {
        gesto.resuelto = true;
        setAction('DETENER confirmado.', 'ok');
      } else if (mensaje.tipo === 'error') {
        gesto.resuelto = true;
        direccion = null;
        setAction(mensaje.mensaje, 'error');
      } else if (mensaje.tipo === 'fin') {
        if (gesto.soltando && !gesto.resuelto) setAction('Palanca suelta. El movimiento se canceló antes de iniciar.');
        if (!gesto.soltando) direccion = null;
        gesto = null;
        renderButtons();
        iniciarGesto();
      }
    });
    canal.addEventListener('close', (event) => {
      if (socket !== canal) return;
      if (gesto) setAction('Se cerró el canal del joystick. Suelta el mando antes de volver a intentar.', 'error');
      cerrarCanal();
      if (event.code !== 4401 && event.code !== 4403) reintento = setTimeout(abrirCanal, 1500);
    });
  }

  function cerrarCanal() {
    clearTimeout(reintento);
    direccion = null;
    soltar();
    const anterior = socket;
    socket = null;
    canalListo = false;
    gesto = null;
    anterior?.close();
    joysticks.forEach(({ joystick }) => joystick.reset());
    renderButtons();
  }

  function iniciarGesto() {
    if (gesto || !direccion || !canalListo || !link || !allowed.has(direccion.codigo)) return;
    const id = crypto.randomUUID();
    if (!transmitir({ tipo: 'iniciar', id_gesto: id, id_enlace: link, codigo: direccion.codigo })) return;
    gesto = { id, enlace: link, soltando: false, resuelto: false };
    setAction(`${NOMBRES[direccion.codigo]} · esperando confirmación del ESP8266…`);
    renderButtons();
  }

  function soltar() {
    if (gesto && !gesto.soltando) {
      gesto.soltando = true;
      transmitir({ tipo: 'soltar', id_gesto: gesto.id });
    }
  }

  function cambiarDireccion(origen, codigo) {
    if (!mantenido || demoActive) return;
    if (direccion && direccion.origen !== origen) return;
    if (!codigo || !allowed.has(codigo)) {
      direccion = null;
      soltar();
      if (codigo) setAction(`${NOMBRES[codigo]} no está habilitado para esta unidad.`);
      return;
    }
    if (!visible || !link || !canalListo || pending.size !== 0) return;
    direccion = { origen, codigo };
    if (!gesto) iniciarGesto();
    else if (!gesto.soltando) transmitir({ tipo: 'cambiar', id_gesto: gesto.id, codigo });
  }

  function detener() {
    direccion = null;
    if (gesto) soltar();
    if (demoActive) onDemoStop?.();
    else if (!gesto) send(DETENER);
    if (mantenido) joysticks.forEach(({ joystick }) => joystick.reset());
  }

  async function send(codigo) {
    if (!visible || !link || (demoActive && codigo !== DETENER)) return;
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
  stop.addEventListener('click', detener);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.repeat && visible) detener();
  });
  renderButtons();

  return {
    select(id, accessToken = null) {
      if (unit === id && token === accessToken) return;
      if (pending.has('movimiento')) send(DETENER);
      cerrarCanal();
      unit = id;
      token = accessToken;
      lastAction += 1;
      pending.clear();
      setAction('Usa los mandos de la unidad seleccionada.');
      watch();
      abrirCanal();
    },
    setDemoActive(active) {
      if (demoActive === active) return;
      demoActive = active;
      if (active) {
        direccion = null;
        soltar();
        joysticks.forEach(({ joystick }) => joystick.reset());
      }
      renderButtons();
    },
    show(shown) {
      if (visible === shown) return;
      if (!shown && pending.has('movimiento')) send(DETENER);
      visible = shown;
      if (!visible) cerrarCanal();
      watch();
      abrirCanal();
    },
  };
}
