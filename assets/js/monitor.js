import { CONFIG } from './config.js';
import { getState, getHistory } from './api.js';
import { friendlyMessage } from './errors.js';
import { getVehicleInfo, getDemos } from './state.js';
import { prettyName, parseTimestamp, formatDate, formatTime } from './utils.js';
import * as view from './monitor-view.js';

// MONITOREO: REST para la carga inicial y la recuperación; WebSocket para los cambios en vivo.
// Reglas: un evento WSS actualiza la tarjeta al instante y solo dispara una resincronización del
// historial persistido (no hay polling). Una respuesta REST nunca pisa un evento más reciente.
const RETRY_DELAY_MS = 600;
const MAX_RETRIES = 2;
const SKIP = Symbol('skip');

let visible = false;
let wsOpen = false;
let everOpen = false;
let card = null;          // último movimiento reportado (REST o WSS)
let loaded = false;       // ya hubo una consulta REST del estado
let stateError = null;
let historyError = null;
let history = [];
let historyLoaded = false;
let eventSeq = 0;         // cuenta los cambios de tarjeta originados por eventos WSS
let lastEventKey = '';
let demoMeta = { name: null, total: null };
let syncing = false;
let queued = null;
let timer = null;
let failures = 0;         // fallos REST seguidos, para el reintento con espera creciente

// ---------- Tarjeta del último movimiento ----------
function noteText(stale) {
  const parts = [];
  if (stale) parts.push('Sin datos actualizados: el WebSocket no está en línea. Se muestra el último valor conocido.');
  else parts.push(card.source === 'ws' ? 'Recibido por WebSocket.' : 'Estado guardado, consultado por REST.');
  if (stateError) parts.push(`Falló la consulta REST del estado (${stateError}); se reintenta automáticamente.`);
  parts.push('Es el último movimiento reportado; no confirma ejecución física.');
  return parts.join(' ');
}

function renderCard() {
  const vehicle = card?.vehicle ?? getVehicleInfo()?.nombre ?? null;
  if (!card) {
    const state = stateError ? 'error' : loaded ? 'empty' : 'loading';
    const note = stateError ? `No se pudo consultar el estado: ${stateError}`
      : loaded ? 'El vehículo aún no tiene movimientos reportados.' : 'Consultando el último estado…';
    view.renderCard({ state, vehicle, note });
    return;
  }
  const stale = !wsOpen;
  view.renderCard({
    state: stale ? 'stale' : 'data',
    name: prettyName(card.name),
    code: card.code,
    date: formatDate(card.ts),
    time: formatTime(card.ts),
    vehicle,
    type: card.type,
    origin: card.origin,
    note: noteText(stale),
  });
}

function setCardFromEvent(next) {
  eventSeq += 1;
  card = { ...next, source: 'ws' };
  stateError = null;
  renderCard();
}

function applyRestState(est) {
  if (est === null) {
    card = null; // la API informa que el vehículo no tiene estado
    return;
  }
  if (typeof est.comando !== 'string' || (est.id_vehiculo !== undefined && est.id_vehiculo !== CONFIG.VEHICLE_ID)) return;
  card = {
    name: est.comando,
    code: est.codigo,
    ts: parseTimestamp(est.fecha_actualizacion),
    type: 'Estado guardado',
    origin: null,
    vehicle: typeof est.vehiculo === 'string' ? est.vehiculo : null,
    source: 'rest',
  };
}

// Un evento WSS solo reemplaza la tarjeta si no es más viejo que el último evento aplicado.
function isNotOlder(ts) {
  return !card || card.source !== 'ws' || !card.ts || !ts || ts >= card.ts;
}

function demoName(id) {
  return getDemos().find((d) => d.id_demo === id)?.nombre ?? `DEMO ${id}`;
}

// ---------- Historial ----------
function normalizeHistory(rows) {
  const byId = new Map();
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    if (!Number.isFinite(row.id_historial) || typeof row.comando !== 'string') return;
    if (row.id_vehiculo !== undefined && row.id_vehiculo !== CONFIG.VEHICLE_ID) return;
    byId.set(row.id_historial, row); // sin duplicados por identificador real
  });
  return [...byId.values()].sort((a, b) => b.id_historial - a.id_historial).slice(0, CONFIG.HISTORY_LIMIT);
}

function applyHistory(rows) {
  const previous = new Set(history.map((r) => r.id_historial));
  const newIds = historyLoaded ? new Set(rows.filter((r) => !previous.has(r.id_historial)).map((r) => r.id_historial)) : new Set();
  history = rows;
  historyLoaded = true;
  view.renderHistory(rows.map((r, i) => {
    const ts = parseTimestamp(r.fecha_hora);
    return { n: i + 1, name: prettyName(r.comando), code: r.codigo, date: formatDate(ts), time: formatTime(ts), id: r.id_historial };
  }), newIds);
  view.setHistoryStatus(`Consultado a las ${formatTime(new Date())} · ${rows.length} de ${CONFIG.HISTORY_LIMIT} registros`, 'ok');
}

// ---------- Sincronización REST ----------
function scheduleSync(opts, delay = CONFIG.SYNC_DEBOUNCE_MS) {
  queued = {
    state: Boolean(queued?.state || opts.state),
    history: Boolean(queued?.history || opts.history),
    afterId: opts.afterId ?? queued?.afterId,
    attempt: opts.attempt ?? queued?.attempt ?? 0,
  };
  clearTimeout(timer);
  timer = setTimeout(runSync, delay);
}

async function runSync() {
  timer = null;
  if (syncing || !queued || !visible) return; // oculto: se resincroniza al entrar en la vista
  const opts = queued;
  queued = null;
  syncing = true;
  const seqAtStart = eventSeq;
  if (opts.history && !historyLoaded) {
    view.renderHistoryMessage('Cargando…');
    view.setHistoryStatus('Cargando…', 'wait');
  }

  const [st, hi] = await Promise.allSettled([
    opts.state ? getState(CONFIG.VEHICLE_ID) : SKIP,
    opts.history ? getHistory(CONFIG.VEHICLE_ID) : SKIP,
  ]);

  if (opts.state) {
    if (st.status === 'fulfilled') {
      loaded = true;
      stateError = null;
      if (eventSeq === seqAtStart) applyRestState(st.value); // si llegó un evento mientras tanto, es más reciente
    } else {
      stateError = friendlyMessage(st.reason);
    }
    renderCard();
  }

  if (opts.history) {
    if (hi.status === 'fulfilled') {
      historyError = null;
      const rows = normalizeHistory(hi.value);
      applyHistory(rows);
      // El evento ya llegó, pero el registro persistido podría tardar: se reintenta de forma acotada.
      if (opts.afterId !== undefined && !(rows[0]?.id_historial > opts.afterId) && opts.attempt < MAX_RETRIES) {
        scheduleSync({ history: true, afterId: opts.afterId, attempt: opts.attempt + 1 }, RETRY_DELAY_MS);
      }
    } else {
      historyError = friendlyMessage(hi.reason);
      if (historyLoaded) view.setHistoryStatus(`No se pudo actualizar: ${historyError}. Se muestra el último valor conocido.`, 'error');
      else {
        view.renderHistoryMessage(`Error: ${historyError}`);
        view.setHistoryStatus('Error al cargar el historial', 'error');
      }
    }
  }

  syncing = false;

  // Si falló una consulta REST se reintenta solo lo que falló, con espera creciente (2, 4, 8… hasta 15 s).
  // Si mientras tanto llegaron eventos nuevos, se sincroniza enseguida.
  const failedState = opts.state && st.status === 'rejected';
  const failedHistory = opts.history && hi.status === 'rejected';
  if (failedState || failedHistory) {
    failures += 1;
    const delay = queued ? 50 : Math.min(2000 * 2 ** (failures - 1), 15000);
    scheduleSync({ state: failedState, history: failedHistory }, delay);
  } else {
    failures = 0;
    if (queued) {
      clearTimeout(timer);
      timer = setTimeout(runSync, 50);
    }
  }
}

// Al volver la red del navegador se vuelve a consultar sin esperar al siguiente reintento.
window.addEventListener('online', () => { if (visible) scheduleSync({ state: true, history: true }, 0); });

// ---------- Entradas públicas ----------
export function onViewChange(name) {
  visible = name === 'monitoreo';
  if (!visible) return;
  renderCard();
  scheduleSync({ state: true, history: true }, 0); // al entrar siempre se resincroniza
}

export function onWsState(state) {
  wsOpen = state === 'open';
  if (wsOpen && everOpen) scheduleSync({ state: true, history: true }, 0); // reconexión: recuperar lo perdido
  if (wsOpen) everOpen = true;
  renderCard();
}

export function onWsEvent(msg) {
  if (msg.id_vehiculo !== undefined && msg.id_vehiculo !== CONFIG.VEHICLE_ID) return; // otro vehículo
  const key = [msg.evento, msg.timestamp, msg.comando, msg.orden].join('|');
  if (key === lastEventKey) return; // duplicado
  lastEventKey = key;
  const ts = parseTimestamp(msg.timestamp);

  switch (msg.evento) {
    case 'movimiento':
      if (typeof msg.comando !== 'string' || !isNotOlder(ts)) break;
      setCardFromEvent({ name: msg.comando, code: msg.codigo, ts, type: 'Movimiento individual', origin: msg.origen });
      scheduleSync({ history: true, afterId: history[0]?.id_historial ?? 0, attempt: 0 });
      break;
    case 'demo_inicio':
      demoMeta = { name: demoName(msg.id_demo), total: msg.total_movimientos };
      view.renderDemoLine(`DEMO iniciada: ${demoMeta.name}${Number.isFinite(demoMeta.total) ? ` (${demoMeta.total} pasos)` : ''}.`);
      break;
    case 'demo_movimiento':
      if (typeof msg.comando !== 'string' || !isNotOlder(ts)) break;
      setCardFromEvent({
        name: msg.comando,
        code: msg.codigo,
        ts,
        type: `Paso ${Number.isFinite(msg.orden) ? msg.orden : '?'}${Number.isFinite(demoMeta.total) ? ` de ${demoMeta.total}` : ''} de DEMO`,
        origin: null,
      }); // los pasos de DEMO actualizan la tarjeta, no el historial individual
      break;
    case 'demo_fin':
      view.renderDemoLine('DEMO finalizada.');
      break;
    case 'demo_cancelada':
      view.renderDemoLine('DEMO cancelada.');
      break;
    case 'estado_actual':
      // Su marca de tiempo es la de la conexión, no la del movimiento: se pide el estado real por REST.
      if (visible) scheduleSync({ state: true });
      break;
    default:
  }
}