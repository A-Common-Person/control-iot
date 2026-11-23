import { assignVehicle, createCustomer, getAudit, getCapabilities, getCustomers, getInventory, getModels, releaseVehicle } from './api.js';
import { initDemoEditor } from './editor-demos.js';
import { initCatalogo } from './catalogo-admin.js';
import { friendlyMessage } from './errors.js';
import { formatDate, formatTime, parseTimestamp } from './utils.js';

const STATUS = { disponible: 'Disponible', asignado: 'Asignada', exhibicion: 'En exhibición', inactivo: 'Inactiva' };
const AUDIT = {
  'demo.creada': 'Demo creada',
  'demo.editada': 'Demo actualizada',
  'cliente.creado': 'Comprador registrado',
  'unidad.asignada': 'Unidad asignada',
  'unidad.reasignada': 'Unidad reasignada',
  'unidad.liberada': 'Unidad liberada',
  'modelo.creado': 'Modelo creado',
  'modelo.editado': 'Modelo actualizado',
  'modelo.desactivado': 'Modelo desactivado',
  'modelo.reactivado': 'Modelo reactivado',
  'modelo.capacidades_actualizadas': 'Comandos del modelo actualizados',
  'modelo.exhibicion_actualizada': 'Mandos de exhibición actualizados',
  'invitado.inicio': 'Prueba de exhibición iniciada',
  'invitado.fin': 'Prueba de exhibición finalizada',
  'unidad.creada': 'Unidad registrada',
  'unidad.editada': 'Unidad actualizada',
  'unidad.desactivada': 'Unidad desactivada',
  'unidad.reactivada': 'Unidad reactivada',
};
const METRICAS = ['models-total', 'units-total', 'units-available', 'units-assigned', 'units-exhibition', 'customers-total'];

const node = (id) => document.getElementById(id);
const vehicleName = (unit) => `${unit.nombre} · ${unit.id_vehiculo}`;
const feedback = (el, message, level = '') => {
  el.textContent = message;
  el.dataset.level = level;
};

async function cargarCompradores() {
  const compradores = [];
  let pagina;
  do {
    pagina = await getCustomers(compradores.length);
    compradores.push(...pagina);
  } while (pagina.length === 100);
  return compradores;
}

export function initAdminView() {
  const tablist = node('admin-tabs');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const inventory = node('inventory-rows');
  const audit = node('audit-rows');
  const search = node('inventory-search');
  const unitSelect = node('assign-unit');
  const customerSelect = node('assign-customer');
  const save = node('assign-save');
  const release = node('assign-release');
  const refreshButton = node('admin-refresh');
  const customerForm = node('customer-form');
  const create = customerForm.querySelector('button[type="submit"]');
  const status = node('admin-feedback');
  const assignmentStatus = node('assignment-feedback');
  const customerStatus = node('customer-feedback');
  const catalogo = initCatalogo({ mutate, feedback });
  const demoPicker = node('demo-unit');
  const demos = initDemoEditor(node('admin-demo-editor'), { onSave: refresh });
  demoPicker.addEventListener('change', () => demos.select(Number(demoPicker.value) || null));

  let unidades = [];
  let compradores = [];
  let activo = false;
  let version = 0;
  let cargando = false;
  let guardando = false;

  const selectedUnit = () => unidades.find((u) => u.id_vehiculo === Number(unitSelect.value));

  function updateButtons() {
    const blocked = !activo || guardando || cargando;
    refreshButton.disabled = blocked;
    unitSelect.disabled = blocked || unitSelect.options.length <= 1;
    customerSelect.disabled = blocked || customerSelect.options.length <= 1;
    const current = selectedUnit();
    save.disabled = blocked || !current || !customerSelect.value;
    release.disabled = blocked || !current?.id_asignacion;
    create.disabled = blocked;
    search.disabled = blocked;
    catalogo.setBlocked(blocked);
  }

  function renderInventory() {
    const people = new Map(compradores.map((p) => [p.id_usuario, p.nombre]));
    const buscar = search.value.trim().toLocaleLowerCase('es');
    const filtradas = unidades.filter((unidad) => (
      `${unidad.nombre} ${unidad.modelo_comercial ?? unidad.modelo ?? ''} ${unidad.id_vehiculo}`
        .toLocaleLowerCase('es').includes(buscar)
    ));
    const filas = filtradas.map((unidad) => {
      const row = document.createElement('tr');
      const celdas = [
        vehicleName(unidad), unidad.modelo_comercial ?? '—', STATUS[unidad.estado_comercial] ?? unidad.estado_comercial,
        people.get(unidad.id_propietario) ?? (unidad.id_propietario ? `Cliente ${unidad.id_propietario}` : '—'),
      ];
      celdas.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      return row;
    });
    if (!filas.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = buscar ? 'No hay unidades que coincidan con la búsqueda.' : 'Sin unidades en el inventario.';
      row.append(cell);
      filas.push(row);
    }
    inventory.replaceChildren(...filas);
  }

  function renderMetrics(modelos) {
    node('models-total').textContent = modelos.length;
    node('units-total').textContent = unidades.length;
    node('units-available').textContent = unidades.filter((u) => u.estado_comercial === 'disponible').length;
    node('units-assigned').textContent = unidades.filter((u) => u.estado_comercial === 'asignado').length;
    node('units-exhibition').textContent = unidades.filter((u) => u.estado_comercial === 'exhibicion').length;
    node('customers-total').textContent = compradores.length;
  }

  function renderOptions() {
    const previous = unitSelect.value;
    const eligible = unidades.filter((u) => u.activo && ['disponible', 'asignado'].includes(u.estado_comercial));
    unitSelect.replaceChildren(
      new Option(eligible.length ? 'Selecciona una unidad' : 'Sin unidades asignables', ''),
      ...eligible.map((u) => new Option(vehicleName(u), u.id_vehiculo)),
    );
    if (eligible.some((u) => String(u.id_vehiculo) === previous)) unitSelect.value = previous;
    const demoUnit = demoPicker.value;
    const demoUnits = unidades.filter((u) => u.activo && u.estado_comercial !== 'inactivo');
    demoPicker.replaceChildren(new Option('Selecciona una unidad', ''), ...demoUnits.map((u) => (
      new Option(vehicleName(u), u.id_vehiculo)
    )));
    if (demoUnits.some((u) => String(u.id_vehiculo) === demoUnit)) demoPicker.value = demoUnit;
    demoPicker.disabled = !demoUnits.length;
    if (!demoPicker.value) demos.select(null);
    const active = compradores.filter((p) => p.activo);
    customerSelect.replaceChildren(
      new Option(active.length ? 'Selecciona un comprador' : 'Sin compradores activos', ''),
      ...active.map((p) => new Option(`${p.nombre} · ${p.correo}`, p.id_usuario)),
    );
    updateSelectedCustomer();
  }

  function updateSelectedCustomer() {
    customerSelect.value = selectedUnit()?.id_propietario ?? '';
    updateButtons();
  }

  function renderAudit(eventos) {
    const rows = eventos.map((event) => {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      const date = document.createElement('time');
      const when = parseTimestamp(event.ocurrio_en);
      const recurso = event.id_vehiculo ? ` · Unidad ${event.id_vehiculo}` : '';
      const modelo = event.accion.startsWith('modelo.') && event.detalle?.nombre ? ` · ${event.detalle.nombre}` : '';
      label.textContent = (AUDIT[event.accion] ?? event.accion) + recurso + modelo;
      date.textContent = `${formatDate(when)} · ${formatTime(when)}`;
      item.append(label, date);
      return item;
    });
    if (!rows.length) {
      const item = document.createElement('li');
      item.textContent = 'Sin cambios registrados.';
      rows.push(item);
    }
    audit.replaceChildren(...rows);
  }

  async function refresh() {
    if (!activo || cargando) return;
    const request = version;
    cargando = true;
    feedback(status, 'Consultando Administración…');
    updateButtons();
    try {
      const [units, people, events, models, capabilities] = await Promise.all([
        getInventory(), cargarCompradores(), getAudit(), getModels(), getCapabilities(),
      ]);
      if (version !== request) return;
      unidades = units;
      compradores = people;
      renderInventory();
      renderMetrics(models);
      renderOptions();
      catalogo.setData(models, units, capabilities);
      renderAudit(events);
      feedback(status, '');
    } catch (error) {
      if (version === request) feedback(status, friendlyMessage(error), 'error');
    } finally {
      if (version === request) {
        cargando = false;
        updateButtons();
      }
    }
  }

  async function mutate(operation, message, target, onSuccess) {
    if (!activo || guardando || cargando) return;
    const request = version;
    guardando = true;
    feedback(target, 'Guardando…');
    updateButtons();
    try {
      await operation();
      if (version !== request) return;
      onSuccess?.();
      feedback(target, message, 'ok');
      await refresh();
    } catch (error) {
      if (version !== request) return;
      feedback(target, friendlyMessage(error), 'error');
      if (target === assignmentStatus && error.status === 409) await refresh();
    } finally {
      if (version === request) {
        guardando = false;
        updateButtons();
      }
    }
  }

  function mostrarSeccion(seleccionada) {
    for (const tab of tabs) {
      const elegida = tab === seleccionada;
      tab.setAttribute('aria-selected', String(elegida));
      tab.tabIndex = elegida ? 0 : -1;
      node(tab.getAttribute('aria-controls')).hidden = !elegida;
    }
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => mostrarSeccion(tab)));
  tablist.addEventListener('keydown', (event) => {
    const actual = tabs.indexOf(event.target);
    if (actual < 0) return;
    const destinos = {
      ArrowLeft: (actual + tabs.length - 1) % tabs.length,
      ArrowRight: (actual + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const siguiente = tabs[destinos[event.key]];
    if (!siguiente) return;
    event.preventDefault();
    mostrarSeccion(siguiente);
    siguiente.focus();
  });

  refreshButton.addEventListener('click', refresh);
  search.addEventListener('input', renderInventory);
  unitSelect.addEventListener('change', () => {
    feedback(assignmentStatus, '');
    updateSelectedCustomer();
  });
  customerSelect.addEventListener('change', updateButtons);
  node('assignment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const unit = selectedUnit();
    if (!unit || !customerSelect.value) return;
    mutate(
      () => assignVehicle(unit.id_vehiculo, Number(customerSelect.value), unit.id_asignacion),
      'Asignación guardada.', assignmentStatus,
    );
  });
  release.addEventListener('click', () => {
    const unit = selectedUnit();
    if (!unit?.id_asignacion) return;
    mutate(() => releaseVehicle(unit.id_vehiculo, unit.id_asignacion), 'Unidad liberada.', assignmentStatus);
  });
  customerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(customerForm));
    customerForm.elements.password.value = '';
    mutate(() => createCustomer(data), 'Comprador registrado.', customerStatus, () => customerForm.reset());
  });

  return {
    setActive(value) {
      activo = value;
      version += 1;
      cargando = false;
      guardando = false;
      unidades = [];
      demoPicker.replaceChildren();
      demoPicker.disabled = true;
      demos.select(null);
      compradores = [];
      inventory.replaceChildren();
      audit.replaceChildren();
      customerForm.reset();
      search.value = '';
      catalogo.reset();
      [status, assignmentStatus, customerStatus].forEach((el) => feedback(el, ''));
      METRICAS.forEach((id) => { node(id).textContent = '—'; });
      renderOptions();
      if (activo) {
        mostrarSeccion(tabs[0]);
        refresh();
      }
    },
  };
}
