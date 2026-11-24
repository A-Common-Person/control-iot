import { endGuestSession, getExhibition, startGuestSession } from './api.js';
import { CONFIG } from './config.js';
import { friendlyMessage } from './errors.js';
import { renderWsState } from './ui.js';
import { createJoystick, DIRECCIONES } from './joystick.js';

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

  // Copia sólo la presentación de la consola. La reserva de invitado tiene su propio canal de órdenes.
  const consola = document.querySelector('#view-control .console').cloneNode(true);
  consola.removeAttribute('aria-labelledby');
  consola.setAttribute('aria-label', 'Control de exhibición');
  consola.querySelector('h2').remove();
  const stop = consola.querySelector('#btn-stop');
  stop.dataset.codigo = DETENER;
  for (const boton of consola.querySelectorAll('[data-action]')) {
    delete boton.dataset.action;
    boton.disabled = true;
    boton.classList.remove('is-on');
    boton.removeAttribute('aria-pressed');
    boton.removeAttribute('aria-label');
    boton.querySelector('.toggle-badge')?.remove();
  }
  const nombres = { 1: 'Avanzar', 2: 'Retroceder', 3: 'Girar a la derecha', 4: 'Girar a la izquierda',
    5: 'Subir brazo', 6: 'Bajar brazo', 10: 'Diagonal izquierda', 11: 'Diagonal derecha' };
  const sticks = Object.entries(DIRECCIONES).map(([id, direcciones]) => {
    const root = consola.querySelector(`#${id}`);
    for (const [dir, codigo] of Object.entries(direcciones)) {
      const icono = root.querySelector(`.dir.${dir}`);
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = icono.className;
      boton.setAttribute('aria-label', nombres[codigo]);
      boton.title = nombres[codigo];
      boton.dataset.codigo = codigo;
      boton.addEventListener('keydown', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (!event.repeat) mantener(codigo);
      });
      boton.addEventListener('keyup', (event) => {
        if (event.key === ' ' || event.key === 'Enter') soltar();
      });
      boton.addEventListener('blur', soltar);
      icono.replaceWith(boton);
    }
    const joystick = createJoystick(root, {
      permite: (dir) => permitido(direcciones[dir]),
      onChange: (dir) => { if (dir) mantener(direcciones[dir]); else soltar(); },
    });
    return { root, joystick, codigos: Object.values(direcciones) };
  });
  consola.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  mandos.append(consola);
  const botones = [...consola.querySelectorAll('button[data-codigo]')];
  stop.addEventListener('click', () => {
    if (permitido(DETENER)) {
      sesion.direccion = null;
      enviar(sesion, { tipo: 'orden', codigo: DETENER });
      sticks.forEach(({ joystick }) => joystick.reset());
    }
  });
  window.addEventListener('blur', soltar);
  document.addEventListener('visibilitychange', () => { if (document.hidden) soltar(); });

  function permitido(codigo) {
    return sesion?.listo && !sesion.cerrando && Date.now() < sesion.vence && sesion.permitidos.has(codigo);
  }

  function soltar() {
    if (!sesion?.direccion) return;
    sesion.direccion = null;
    enviar(sesion, { tipo: 'orden', codigo: DETENER });
  }

  function mantener(codigo) {
    if (!permitido(codigo) || sesion.direccion === codigo) return;
    soltar();
    if (enviar(sesion, { tipo: 'mantener', codigo })) sesion.direccion = codigo;
  }

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
    for (const { joystick } of sticks) joystick.reset();
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
    for (const boton of botones) boton.disabled = !permitido(Number(boton.dataset.codigo));
    for (const { root, codigos } of sticks) {
      root.inert = !codigos.some((codigo) => actual.permitidos.has(codigo));
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
        permitidos: new Set(data.comandos.map(({ codigo }) => codigo)),
        token: data.token, vence: Date.now() + data.segundos * 1000,
        socket: null, listo: false, direccion: null, cerrando: false,
      };
      sesion = actual;
      const socket = new WebSocket(url);
      actual.socket = socket;
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
          if (!actual.cerrando) avisar('Mantén la dirección para mover el vehículo. Suéltala para detenerlo.');
          latido = setInterval(() => enviar(actual, { tipo: 'latido' }), 2000);
        } else if (msg.tipo === 'finalizada') {
          mostrarCierre(msg);
          limpiar(actual);
          cargar();
          return;
        } else if (msg.tipo === 'movimiento_aplicado') {
          if (actual.direccion === msg.codigo) avisar('Movimiento confirmado. Suelta para detener.', 'ok');
        } else if (['detenido', 'rechazada'].includes(msg.tipo) && (!actual.direccion || msg.tipo === 'rechazada')) {
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
