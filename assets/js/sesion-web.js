import { getMyVehicles, getVehicle, login, logout, setSessionToken } from './api.js';
import { initAuthorizedDemo } from './demo.js';
import { initDemoEditor } from './editor-demos.js';
import { initAdminView } from './administracion.js';
import { initTestControl } from './control-prueba.js';
import { friendlyMessage } from './errors.js';
import * as monitor from './monitor.js';
import { initRouter } from './router.js';
import { setVehicle } from './state.js';
import * as ui from './ui.js';
import { startWebSocket } from './websocket.js';

const byId = (id) => document.getElementById(id);
const VISTAS = { administrador: ['administracion'], usuario: ['monitoreo', 'control'] };

export function initAdministrationPreview() {
  const loginForm = byId('login-form');
  const loginButton = loginForm.querySelector('button[type="submit"]');
  const loginFeedback = byId('login-feedback');
  const vehiclePicker = byId('vehicle-picker');
  const vehicleFeedback = byId('vehicle-feedback');
  const admin = initAdminView();
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
  byId('ind-ws').querySelector('.label').textContent = 'WebSocket local';
  byId('ind-api').querySelector('.label').textContent = 'API FastAPI local';
  byId('preview-control').hidden = false;

  const router = initRouter({
    onChange(vista) {
      monitor.onViewChange(vista);
      testControl.show(vista === 'control');
    },
    allowed: () => VISTAS[sesion?.usuario.rol] ?? ['acceso'],
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
    ui.setVehicleName(rol === 'administrador' ? 'Inventario de pruebas' : 'Sin vehículo seleccionado');
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
    testControl.select(unidad, sesion.access_token);
    demoPanel.hidden = false;
    demos.select(unidad);
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
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginButton.disabled) return;
    loginButton.disabled = true;
    informeLogin('Conectando…');
    const { correo, password } = Object.fromEntries(new FormData(loginForm));
    loginForm.elements.password.value = '';
    try {
      const nueva = await login(correo.trim(), password);
      loginForm.reset();
      cambiarSesion(nueva);
    } catch (error) {
      informeLogin(friendlyMessage(error), 'error');
      loginForm.elements.password.focus();
    } finally {
      loginButton.disabled = false;
    }
  });
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
