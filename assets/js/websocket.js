import { CONFIG } from './config.js';

// Sesión WSS real del navegador con la API. Reconecta con espera creciente.
// Estados que informa: 'connecting' | 'open' | 'reconnecting' | 'disconnected'.
// Importante: "open" significa que el NAVEGADOR está conectado al servidor WSS;
// no demuestra que el vehículo físico esté conectado.
const QUICK_ATTEMPTS = 3;   // intentos mostrados como "Reconectando"; luego "Desconectado"
const MAX_DELAY_MS = 15000;
const FINAL_CODES = [4401, 4403, 4404];

export function startWebSocket({ vehicleId, token, onState, onEvent, onDenied }) {
  const url = `${CONFIG.WS_BASE_URL}/${encodeURIComponent(vehicleId)}`;
  let socket = null;
  let attempts = 0;
  let timer = null;
  let stopped = false;

  function scheduleRetry() {
    attempts += 1;
    onState(attempts <= QUICK_ATTEMPTS ? 'reconnecting' : 'disconnected');
    const delay = Math.min(1000 * 2 ** (attempts - 1), MAX_DELAY_MS) + Math.random() * 500;
    timer = setTimeout(connect, delay);
  }

  function connect() {
    clearTimeout(timer);
    if (stopped) return;
    if (attempts === 0) onState('connecting');

    try {
      socket = new WebSocket(url);
    } catch {
      scheduleRetry();
      return;
    }

    const current = socket;
    let authorized = !token;
    const isCurrent = () => !stopped && socket === current;

    function setOpen() {
      attempts = 0;
      onState('open');
    }

    current.addEventListener('open', () => {
      if (!isCurrent()) return;
      if (token) current.send(JSON.stringify({ tipo: 'autenticar', token }));
      else setOpen();
    });

    current.addEventListener('message', (ev) => {
      if (!isCurrent()) return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return; // mensaje no JSON: se ignora
      }
      if (!msg || typeof msg.evento !== 'string') return;
      if (msg.id_vehiculo !== undefined && msg.id_vehiculo !== vehicleId) return;
      if (!authorized) {
        if (msg.evento !== 'estado_actual' || msg.id_vehiculo !== vehicleId) return;
        authorized = true;
        setOpen();
      }
      onEvent(msg);
    });

    current.addEventListener('close', (ev) => {
      if (!isCurrent()) return;
      if (FINAL_CODES.includes(ev.code)) {
        stop();
        onState('disconnected');
        onDenied?.(ev.code);
        return;
      }
      scheduleRetry();
    });
    // 'error' siempre va seguido de 'close', que es donde se reintenta.
  }

  // Al volver a la pestaña, si la sesión no está viva, reintenta sin esperar.
  function onVisibility() {
    if (document.hidden || stopped) return;
    const alive = socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
    if (!alive) connect();
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }

  document.addEventListener('visibilitychange', onVisibility);

  connect();
  return { stop };
}
