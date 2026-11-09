import { getHealth } from './api.js';
import { CONFIG } from './config.js';

// Comprueba GET /health periódicamente. Informa:
//   api: 'checking' | 'ok' | 'down'      -> la API responde (no prueba que las 21 rutas funcionen)
//   rds: 'ok' | 'down' | 'unverified'    -> solo según el diagnóstico que expone el backend
// Si la API no responde, RDS queda "unverified": no se le atribuye la caída sin evidencia.
const RETRY_AFTER_FAILURE_MS = 5000;

export function startHealthMonitor({ onResult }) {
  let timer = null;
  let running = false;
  let lastOk = false;

  async function check() {
    if (running) return;
    running = true;
    clearTimeout(timer);
    if (!lastOk) onResult({ api: 'checking', rds: 'unverified' });

    try {
      const data = await getHealth();
      const apiOk = Boolean(data) && typeof data === 'object' && data.api === 'ok';
      let rds = 'unverified';
      if (apiOk && data.database === 'ok') rds = 'ok';
      else if (apiOk && data.database === 'error') rds = 'down';
      lastOk = apiOk;
      onResult({ api: apiOk ? 'ok' : 'down', rds });
    } catch {
      lastOk = false;
      onResult({ api: 'down', rds: 'unverified' });
    } finally {
      running = false;
      // Una sola comprobación pendiente a la vez; más espaciada cuando todo va bien.
      timer = setTimeout(check, lastOk ? CONFIG.HEALTH_INTERVAL_MS : RETRY_AFTER_FAILURE_MS);
    }
  }

  // No consulta en segundo plano; al volver a la pestaña comprueba de inmediato.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

  check();
}
