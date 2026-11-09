// Todo lo que toca el DOM. Los datos remotos se insertan solo con textContent.
const $ = (id) => document.getElementById(id);

export function setVehicleName(text) {
  $('vehicle-name').textContent = text;
}

export function setAction(text, level = 'info') {
  const bar = $('action-bar');
  const time = new Date().toLocaleTimeString('es-MX', { hour12: false });
  bar.textContent = `${time} · ${text}`;
  bar.dataset.level = level;
}

export function renderDemos(demos) {
  const select = $('demo-select');
  select.replaceChildren();
  if (demos.length === 0) {
    select.append(new Option('No hay DEMO disponibles', ''));
    select.disabled = true;
    return;
  }
  select.append(new Option('Selecciona una DEMO…', ''));
  demos.forEach((d) => select.append(new Option(d.nombre, String(d.id_demo))));
  select.disabled = false;
}

// Deshabilita los botones auxiliares cuyo comando no existe en el catálogo.
export function markAvailableCommands(findCommand) {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    const available = Boolean(findCommand(btn.dataset.action));
    btn.disabled = !available;
    btn.title = available ? '' : 'Este comando no está en el catálogo del vehículo';
  });
}

// ---------- Indicadores de conexión (texto + icono + color, nunca solo color) ----------
const ICONS = {
  ok: 'bi-check-circle-fill',
  wait: 'bi-hourglass-split',
  bad: 'bi-x-circle-fill',
  none: 'bi-question-circle',
};

function setIndicator(id, state, text) {
  const item = $(id);
  item.dataset.state = state;
  item.querySelector('i').className = `bi ${ICONS[state]} fs-5`;
  item.querySelector('.value').textContent = text;
}

const WS_VIEW = {
  open: ['ok', 'En línea'],
  connecting: ['wait', 'Conectando…'],
  reconnecting: ['wait', 'Reconectando…'],
  disconnected: ['bad', 'Desconectado'],
};
export function renderWsState(state) {
  const [level, text] = WS_VIEW[state] ?? WS_VIEW.disconnected;
  setIndicator('ind-ws', level, text);
  if (state === 'disconnected') {
    const bar = $('event-bar');
    bar.textContent = 'WebSocket desconectado. Si usas un bloqueador de anuncios (por ejemplo Brave Shields), desactívalo para este sitio y recarga.';
    bar.dataset.level = 'error';
  }
}

const API_VIEW = { ok: ['ok', 'Disponible'], checking: ['wait', 'Comprobando…'], down: ['bad', 'No disponible'] };
const RDS_VIEW = { ok: ['ok', 'Disponible'], down: ['bad', 'No disponible'], unverified: ['none', 'Sin verificar'] };
export function renderHealth({ api, rds }) {
  setIndicator('ind-api', ...(API_VIEW[api] ?? API_VIEW.down));
  setIndicator('ind-rds', ...(RDS_VIEW[rds] ?? RDS_VIEW.unverified));
}

// ---------- Eventos recibidos por WebSocket ----------
const EVENT_NAMES = {
  estado_actual: 'Estado inicial',
  movimiento: 'Movimiento',
  demo_inicio: 'DEMO iniciada',
  demo_movimiento: 'Paso de DEMO',
  demo_fin: 'DEMO finalizada',
  demo_cancelada: 'DEMO cancelada',
};
const clean = (v) => String(v).slice(0, 40);

export function showWsEvent(msg) {
  const parts = [EVENT_NAMES[msg.evento] ?? clean(msg.evento)];
  if (typeof msg.comando === 'string') {
    const code = Number.isFinite(msg.codigo) ? ` (${msg.codigo})` : '';
    parts.push(`${clean(msg.comando)}${code}`);
  }
  if (Number.isFinite(msg.orden)) parts.push(`paso ${msg.orden}`);
  if (Number.isFinite(msg.total_movimientos)) parts.push(`${msg.total_movimientos} movimientos`);
  const date = new Date(msg.timestamp);
  const time = Number.isNaN(date.getTime()) ? '' : ` · ${date.toLocaleTimeString('es-MX', { hour12: false })}`;
  const bar = $('event-bar');
  bar.textContent = `Evento WebSocket: ${parts.join(' · ')}${time}`;
  bar.dataset.level = 'ok';
}

// Estado visible de un botón: enviando / error (el estado "presionado" lo da :active).
export function setButtonState(btn, state) {
  btn.classList.toggle('is-sending', state === 'sending');
  btn.classList.toggle('is-error', state === 'error');
  btn.setAttribute('aria-busy', state === 'sending' ? 'true' : 'false');
}

// ---------- DEMO y clave de operador ----------
let demoCatalog = false;
const KEY_STORAGE = 'control-iot:operator-key';

export function getSelectedDemo() { return $('demo-select').value; }
export function getOperatorKey() { return $('operator-key').value.trim(); }

// La clave se escribe en la página y solo se guarda en esta pestaña (sessionStorage).
export function initOperatorKey() {
  const input = $('operator-key');
  try { input.value = sessionStorage.getItem(KEY_STORAGE) ?? ''; } catch { /* sin almacenamiento */ }
  input.addEventListener('input', () => {
    try { sessionStorage.setItem(KEY_STORAGE, input.value.trim()); } catch { /* sin almacenamiento */ }
  });
}

export function setDemoStatus(text, level = 'info') {
  const box = $('demo-status');
  box.textContent = text;
  box.dataset.level = level;
}

export function updateDemoControls(running) {
  const select = $('demo-select');
  demoCatalog = select.options.length > 1;
  select.disabled = running || !demoCatalog;
  $('btn-demo-start').disabled = running || !demoCatalog || select.value === '';
  $('btn-demo-cancel').disabled = !demoCatalog; // cancelar nunca se bloquea por una DEMO en marcha
}
