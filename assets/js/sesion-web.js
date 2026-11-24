import { getMyVehicles, getTestControl, getVehicle, login, logout, setSessionToken } from './api.js';
import { initAuthorizedDemo } from './demo.js';
import { initDemoEditor } from './editor-demos.js';
import { CONFIG } from './config.js';
import { initExhibition } from './exhibicion.js';
import { initAdminView } from './administracion.js';
import { initTestControl } from './control-prueba.js';
import { friendlyMessage } from './errors.js';
import * as monitor from './monitor.js';
import { initRouter } from './router.js';
import { setVehicle } from './state.js';
import * as ui from './ui.js';
import { startWebSocket } from './websocket.js';

const byId = (id) => document.getElementById(id);
const VISTAS = { administrador: ['administracion'], usuario: ['monitoreo', 'control', 'demos'] };

const PERFILES = {
  administrador: { correo: 'erik.qglz@gmail.com', password: '012345678910' },
  comprador: { correo: 'abcd@gmail.com', password: '012345678910' },
};

export function initAdministrationPreview() {
  const formularios = [...document.querySelectorAll('#view-login form[data-perfil]')];
  const botones = formularios.map(form => form.querySelector('[type="submit"]'));
  const loginFeedback = byId('login-feedback');

  for (const form of formularios) {
    const perfil = PERFILES[form.dataset.perfil];
    if (!perfil) continue;
    form.elements.correo.defaultValue = perfil.correo;
    form.elements.password.defaultValue = perfil.password;
    form.reset();
  }

  if (window.opener && new URLSearchParams(location.search).has('presentacion')) {
    const recibir = (event) => {
      if (event.source !== window.opener || event.origin !== 'null' ||
          event.data?.tipo !== 'perfiles-presentacion') return;
      for (const form of formularios) {
        const perfil = event.data.perfiles?.[form.dataset.perfil];
        if (typeof perfil?.correo !== 'string' || typeof perfil.password !== 'string') continue;
        form.elements.correo.defaultValue = perfil.correo;
        form.elements.password.defaultValue = perfil.password;
      }
      window.removeEventListener('message', recibir);
    };
    window.addEventListener('message', recibir);
    window.opener.postMessage('solicitar-perfiles', '*');
  }
  const vehiclePicker = byId('vehicle-picker');
  const vehicleFeedback = byId('vehicle-feedback');
  const admin = initAdminView({ probarUnidad: async (vehiculo) => {
    const actual = sesion;
    const { data } = await getTestControl(vehiculo.id_vehiculo);
    if (sesion !== actual || sesion?.usuario.rol !== 'administrador') return;
    if (!data.dispositivo_en_linea) throw new Error('El dispositivo está desconectado.');
    await elegirUnidad(vehiculo);
    window.location.hash = 'control';
  } });
  const exhibition = initExhibition();
  const playback = initAuthorizedDemo({ onActive: (active) => testControl.setDemoActive(active) });
  const testControl = initTestControl({
    onDemoState: playback.sync, onDemoStop: playback.stop, onManualBusy: playback.onManualBusy,
  });
  const demoPanel = byId('buyer-demo-editor');
  const demos = initDemoEditor(demoPanel, { onSave: cargarDetalle });
  let sesion = null;
  let asignados = [];
  let unidad = null;
  let canal = null;
  let revision = 0;
  let seleccion = 0;

  document.body.dataset.preview = 'administracion';
  if (CONFIG.ADMINISTRACION_LOCAL) {
    byId('ind-ws').querySelector('.label').textContent = 'WebSocket local';
    byId('ind-api').querySelector('.label').textContent = 'API FastAPI local';
  }
  byId('preview-control').hidden = false;

  const router = initRouter({
    onChange(vista) {
      monitor.onViewChange(vista);
      exhibition.setActive(vista === 'invitado');
      testControl.show(vista === 'control');
      if (vista === 'administracion' && unidad !== null) {
        detenerMonitoreo();
        ui.setVehicleName('Inventario');
        router.refresh();
      }
    },
    allowed: () => sesion?.usuario.rol === 'administrador' && unidad !== null
      ? ['administracion', 'control'] : VISTAS[sesion?.usuario.rol] ?? ['acceso', 'invitado'],
  });

  function informeLogin(mensaje, nivel = '') {
    loginFeedback.textContent = mensaje;
    loginFeedback.dataset.level = nivel;
  }

  function detenerMonitoreo() {
    seleccion += 1;
    canal?.stop();
    canal = null;
    unidad = null;
    setVehicle(null);
    playback.select(null);
    testControl.select(null);
    demoPanel.hidden = true;
    demos.select(null);
    monitor.selectVehicle(null);
    ui.renderWsState('inactive');
    byId('event-bar').textContent = 'Sin suscripción activa.';
    byId('event-bar').dataset.level = 'info';
  }

  function cambiarSesion(nueva, mensaje = '', nivel = '') {
    revision += 1;
    sesion = nueva;
    setSessionToken(nueva?.access_token, () => {
      if (sesion === nueva) cambiarSesion(null, 'Tu sesión venció. Vuelve a iniciar sesión.', 'error');
    });
    detenerMonitoreo();
    asignados = [];
    vehiclePicker.replaceChildren(new Option('Sin vehículos asignados', ''));
    vehiclePicker.disabled = true;
    vehicleFeedback.textContent = '';
    const rol = nueva?.usuario.rol;
    byId('session-bar').hidden = !nueva;
    byId('session-name').textContent = nueva?.usuario.nombre ?? '';
    byId('session-role').textContent = nueva ? (rol === 'administrador' ? 'Administrador' : 'Comprador') : '';
    byId('session-unit').hidden = rol !== 'usuario';
    ui.setVehicleName(rol === 'administrador' ? 'Inventario' : 'Sin vehículo seleccionado');
    informeLogin(mensaje, nivel);
    admin.setActive(rol === 'administrador');
    router.refresh(true);
    if (rol === 'usuario') cargarVehiculos();
  }

  function accesoPerdido(codigo) {
    if (codigo === 4401) {
      cambiarSesion(null, 'Tu sesión venció. Vuelve a iniciar sesión.', 'error');
      return;
    }
    detenerMonitoreo();
    ui.setVehicleName('Sin vehículo seleccionado');
    if (sesion?.usuario.rol === 'administrador') {
      window.location.hash = 'administracion';
      return;
    }
    cargarVehiculos('La unidad anterior ya no está disponible para esta sesión.');
  }

  async function elegirUnidad(vehiculo) {
    if (!sesion || unidad === vehiculo?.id_vehiculo) return;
    detenerMonitoreo();
    if (!vehiculo) {
      ui.setVehicleName('Sin vehículo seleccionado');
      return;
    }
    const actual = seleccion;
    unidad = vehiculo.id_vehiculo;
    setVehicle(vehiculo);
    ui.setVehicleName(`${vehiculo.nombre} · ID ${unidad}`);
    monitor.selectVehicle(unidad);
    playback.select(unidad);
    const comprador = sesion.usuario.rol === 'usuario';
    testControl.select(unidad, sesion.access_token, !comprador);
    demoPanel.hidden = !comprador;
    if (comprador) demos.select(unidad);
    canal = startWebSocket({
      vehicleId: unidad,
      token: sesion.access_token,
      onState(estado) {
        if (seleccion !== actual) return;
        ui.renderWsState(estado);
        monitor.onWsState(estado);
        playback.onWsState(estado);
      },
      onEvent(evento) {
        if (seleccion !== actual) return;
        ui.showWsEvent(evento);
        monitor.onWsEvent(evento);
        playback.onEvent(evento);
      },
      onDenied(codigo) {
        if (seleccion === actual) accesoPerdido(codigo);
      },
    });
    cargarDetalle();
  }

  async function cargarDetalle() {
    if (!unidad) return;
    const actual = seleccion;
    try {
      const detalle = await getVehicle(unidad);
      if (seleccion !== actual) return;
      setVehicle(detalle);
      playback.refreshCatalog();
    } catch (error) {
      if (seleccion !== actual) return;
      if (error.status === 403) accesoPerdido(4403);
      else vehicleFeedback.textContent = friendlyMessage(error);
    }
  }

  async function cargarVehiculos(mensaje = '') {
    const nuevaRevision = ++revision;
    vehiclePicker.disabled = true;
    vehicleFeedback.textContent = mensaje || 'Consultando asignaciones…';
    try {
      const vehicles = await getMyVehicles();
      if (revision !== nuevaRevision) return;
      asignados = vehicles;
      vehiclePicker.replaceChildren(...(
        asignados.length
          ? asignados.map((row) => new Option(`${row.nombre} · ID ${row.id_vehiculo}`, row.id_vehiculo))
          : [new Option('Sin vehículos asignados', '')]
      ));
      const siguiente = asignados.find((v) => v.id_vehiculo === unidad) ?? asignados[0];
      if (siguiente) vehiclePicker.value = String(siguiente.id_vehiculo);
      vehiclePicker.disabled = !siguiente;
      vehicleFeedback.textContent = mensaje || (siguiente ? '' : 'Aún no tienes unidades asignadas.');
      elegirUnidad(siguiente);
    } catch (error) {
      if (revision === nuevaRevision) vehicleFeedback.textContent = friendlyMessage(error);
    }
  }

  vehiclePicker.addEventListener('change', () => {
    vehicleFeedback.textContent = '';
    elegirUnidad(asignados.find((v) => v.id_vehiculo === Number(vehiclePicker.value)));
  });
  async function enviarAcceso(event) {
    const loginForm = event.currentTarget;
    event.preventDefault();
    if (botones.some(boton => boton.disabled)) return;
    botones.forEach(boton => { boton.disabled = true; });
    informeLogin('Conectando…');
    const { correo, password } = Object.fromEntries(new FormData(loginForm));
    loginForm.elements.password.value = '';
    try {
      const nueva = await login(correo.trim(), password);
      loginForm.reset();
      cambiarSesion(nueva);
    } catch (error) {
      informeLogin(friendlyMessage(error), 'error');
      loginForm.elements.password.value = loginForm.elements.password.defaultValue;
      loginForm.elements.password.focus();
    } finally {
      botones.forEach(boton => { boton.disabled = false; });
    }
  }
  formularios.forEach(form => form.addEventListener('submit', enviarAcceso));
  byId('logout').addEventListener('click', async () => {
    const cerrar = logout();
    cambiarSesion(null, 'Sesión cerrada.', 'ok');
    const revisionSalida = revision;
    try {
      await cerrar;
    } catch (error) {
      if (error.status !== 401 && revisionSalida === revision) {
        informeLogin('Se retiró la sesión del navegador. El servidor no confirmó el cierre.', 'error');
      }
    }
  });

  cambiarSesion(null);
}
