import { CONFIG } from './config.js';

// Sesión WSS real del navegador con la API. Reconecta con espera creciente.
// Estados que informa: 'connecting' | 'open' | 'reconnecting' | 'disconnected'.
// Importante: "open" significa que el NAVEGADOR está conectado al servidor WSS;
// no demuestra que el vehículo físico esté conectado.
const QUICK_ATTEMPTS = 3;   // intentos mostrados como "Reconectando"; luego "Desconectado"
const MAX_DELAY_MS = 15000;
const NOT_FOUND_CODE = 4404; // la API cierra con este código si el vehículo no existe

export function startWebSocket({ vehicleId, onState, onEvent }) {
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

    socket.addEventListener('open', () => {
      attempts = 0;
      onState('open');
    });

    socket.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return; // mensaje no JSON: se ignora
      }
      if (msg && typeof msg === 'object' && typeof msg.evento === 'string') onEvent(msg);
    });

    socket.addEventListener('close', (ev) => {
      if (stopped) return;
      if (ev.code === NOT_FOUND_CODE) {
        stopped = true;
        onState('disconnected');
        return;
      }
      scheduleRetry();
    });
    // 'error' siempre va seguido de 'close', que es donde se reintenta.
  }

  // Al volver a la pestaña, si la sesión no está viva, reintenta sin esperar.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || stopped) return;
    const alive = socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
    if (!alive) connect();
  });

  connect();
  return { stop() { stopped = true; clearTimeout(timer); socket?.close(); } };
}
