import { endGuestSession, getExhibition, startGuestSession } from './api.js';
import { CONFIG } from './config.js';
import { friendlyMessage } from './errors.js';
import { renderWsState } from './ui.js';

const DETENER = 9;

const estados = {
  disponible: 'Disponible para probar',
  ocupada: 'En uso',
  sin_conexion: 'Equipo fuera de línea',
  sin_configurar: 'Prueba sin habilitar',
};

export function initExhibition() {
  const lista = document.getElementById('exhibition-models');
  const actualizar = document.getElementById('exhibition-refresh');
  const panel = document.getElementById('guest-session');
  const mandos = document.getElementById('guest-commands');
  const terminar = document.getElementById('guest-end');
  const tiempo = document.getElementById('guest-countdown');
  const estado = document.getElementById('guest-feedback');
  let activa = false;
  let revision = 0;
  let ocupada = false;
  let sesion = null;
  let contador;
  let latido;

  function avisar(texto, nivel = '') {
    estado.textContent = texto;
    estado.dataset.level = nivel;
  }

  function dibujar(modelos) {
    const tarjetas = modelos.map((modelo) => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'panel exhibition-model';
      const titulo = document.createElement('h2');
      titulo.textContent = modelo.nombre;
      tarjeta.append(titulo);
      if (modelo.descripcion) {
        const p = document.createElement('p');
        p.textContent = modelo.descripcion;
        tarjeta.append(p);
      }
      if (modelo.capacidades.length) {
        const p = document.createElement('p');
        p.className = 'iot-feedback';
        p.textContent = `Mandos de prueba: ${modelo.capacidades.join(', ')}.`;
        tarjeta.append(p);
      }
      const unidades = document.createElement('ul');
      unidades.className = 'exhibition-units';
      for (const unidad of modelo.unidades) {
        const fila = document.createElement('li');
        const datos = document.createElement('span');
        datos.textContent = `Unidad ${unidad.id_vehiculo} · ${estados[unidad.disponibilidad]}`;
        fila.append(datos);
        if (unidad.disponibilidad === 'disponible') {
          const boton = document.createElement('button');
          boton.type = 'button';
          boton.className = 'btn btn-warning iot-primary';
          boton.textContent = 'Iniciar prueba';
          boton.addEventListener('click', () => iniciar(unidad.id_vehiculo));
          boton.disabled = ocupada || Boolean(sesion);
          fila.append(boton);
        }
        unidades.append(fila);
      }
      if (!unidades.children.length) {
        const fila = document.createElement('li');
        fila.textContent = 'Sin unidades de exhibición.';
        unidades.append(fila);
      }
      tarjeta.append(unidades);
      return tarjeta;
    });
    lista.replaceChildren(...tarjetas);
    if (!tarjetas.length) lista.textContent = 'El catálogo aún no tiene modelos disponibles.';
  }

  async function cargar() {
    if (!activa) return;
    const actual = revision;
    actualizar.disabled = true;
    try {
      const { data } = await getExhibition();
      if (activa && actual === revision) dibujar(data);
    } catch (error) {
      if (activa && actual === revision) avisar(friendlyMessage(error), 'error');
    } finally {
      if (activa && actual === revision) actualizar.disabled = false;
    }
  }

  function limpiar(actual) {
    if (sesion !== actual) return;
    clearInterval(latido);
    clearInterval(contador);
    sesion = null;
    panel.hidden = true;
    actual.socket?.close();
    if (activa) renderWsState('inactive');
  }

  function enviar(actual, datos) {
    if (actual.socket?.readyState !== WebSocket.OPEN) return false;
    actual.socket.send(JSON.stringify(datos));
    return true;
  }

  function renderMandos(actual) {
    for (const button of mandos.querySelectorAll('button')) {
      button.disabled = !actual.listo || actual.cerrando || (!Number(tiempo.textContent))
        || (actual.moviendo && Number(button.dataset.codigo) !== DETENER);
    }
    terminar.disabled = actual.cerrando;
  }

  function actualizarTiempo(actual, segundos) {
    if (typeof segundos === 'number') actual.vence = Date.now() + segundos * 1000;
    tiempo.textContent = Math.max(0, Math.ceil((actual.vence - Date.now()) / 1000));
    renderMandos(actual);
  }

  async function finalizar() {
    const actual = sesion;
    if (!actual || actual.cerrando) return;
    actual.cerrando = true;
    renderMandos(actual);
    avisar('Esperando la confirmación de DETENER…');
    if (enviar(actual, { tipo: 'finalizar' })) return;
    try {
      const { data } = await endGuestSession(actual.token);
      if (sesion === actual && activa) mostrarCierre(data);
    } catch (error) {
      if (sesion === actual && activa) avisar(friendlyMessage(error), 'error');
    } finally {
      limpiar(actual);
      cargar();
    }
  }

  function mostrarCierre(datos) {
    const termino = datos.motivo === 'tiempo_agotado' ? 'Terminó el tiempo de prueba.' : 'Prueba finalizada.';
    if (!datos.reserva_cerrada) avisar(`${termino} La API no confirmó que se liberó la unidad.`, 'error');
    else if (!datos.detencion_confirmada) avisar(`${termino} El dispositivo no confirmó DETENER.`, 'error');
    else avisar(`${termino} Unidad liberada y DETENER confirmado.`, 'ok');
  }

  async function iniciar(unidad) {
    if (!activa || ocupada || sesion) return;
    ocupada = true;
    const solicitud = revision;
    lista.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    avisar('Solicitando una reserva…');
    try {
      const { data } = await startGuestSession(unidad);
      if (!activa || revision !== solicitud) {
        await endGuestSession(data.token);
        return;
      }
      const url = CONFIG.WS_BASE_URL.replace(/\/vehiculos$/, '/exhibicion');
      const actual = {
        token: data.token, vence: Date.now() + data.segundos * 1000,
        socket: null, listo: false, moviendo: false, cerrando: false,
      };
      sesion = actual;
      const socket = new WebSocket(url);
      actual.socket = socket;
      mandos.replaceChildren(...data.comandos.map(({ codigo, nombre }) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = codigo === DETENER ? 'btn btn-outline-danger session-button' : 'btn btn-warning iot-primary';
        boton.dataset.codigo = codigo;
        boton.textContent = nombre;
        boton.addEventListener('click', () => {
          if (enviar(actual, { tipo: 'orden', codigo }) && codigo !== DETENER) {
            actual.moviendo = true;
            avisar('Movimiento solicitado. Pulsa DETENER para interrumpirlo.');
            renderMandos(actual);
          }
        });
        return boton;
      }));
      panel.hidden = false;
      actualizarTiempo(actual);
      renderWsState('connecting');
      avisar('Conectando al canal de exhibición…');
      contador = setInterval(() => actualizarTiempo(actual), 200);
      socket.addEventListener('open', () => enviar(actual, { tipo: 'autenticar', token: actual.token }));
      socket.addEventListener('message', ({ data: texto }) => {
        if (sesion !== actual) return;
        let msg;
        try { msg = JSON.parse(texto); } catch { socket.close(); return; }
        if (msg.tipo === 'lista') {
          actual.listo = true;
          renderWsState('open');
          if (!actual.cerrando) avisar('Cada movimiento dura hasta 2 segundos por toque.');
          latido = setInterval(() => enviar(actual, { tipo: 'latido' }), 2000);
        } else if (msg.tipo === 'finalizada') {
          mostrarCierre(msg);
          limpiar(actual);
          cargar();
          return;
        } else if (['pulso_confirmado', 'detenido', 'rechazada'].includes(msg.tipo)) {
          actual.moviendo = false;
          if (!actual.cerrando) avisar(msg.mensaje ?? 'DETENER confirmado.', msg.tipo === 'rechazada' ? 'error' : 'ok');
        }
        actualizarTiempo(actual, msg.segundos);
      });
      socket.addEventListener('close', () => {
        if (sesion !== actual) return;
        limpiar(actual);
        if (activa) {
          renderWsState('disconnected');
          avisar('Se cerró el canal de exhibición. Actualiza el catálogo para comprobar la disponibilidad.', 'error');
          cargar();
        }
      });
    } catch (error) {
      if (activa && revision === solicitud) {
        if (sesion) limpiar(sesion);
        avisar(friendlyMessage(error), 'error');
      }
    } finally {
      ocupada = false;
      cargar();
    }
  }

  actualizar.addEventListener('click', cargar);
  terminar.addEventListener('click', finalizar);
  window.addEventListener('pagehide', () => { if (sesion) limpiar(sesion); });
  return {
    setActive(value) {
      if (activa === value) return;
      activa = value;
      revision += 1;
      if (activa) {
        renderWsState('inactive');
        avisar('');
        cargar();
      } else if (sesion) limpiar(sesion);
    },
  };
}
