import { createModel, createUnit, saveCapabilities, saveGuestCapabilities, saveModel, saveUnit } from './api.js';
import { prettyName } from './utils.js';

const byId = (id) => document.getElementById(id);
const modeloLabel = (modelo) => `${modelo.nombre}${modelo.activo ? '' : ' · Inactivo'}`;
const estados = [ ['disponible', 'Disponible'], ['exhibicion', 'En exhibición'], ['inactivo', 'Inactiva'] ];
const opcional = (value) => value.trim() || null;

function opciones(select, items, valor = select.value) {
  select.replaceChildren(...items);
  if (items.some((item) => item.value === valor)) select.value = valor;
}

export function initCatalogo({ mutate, feedback }) {
  const modelForm = byId('model-form');
  const unitForm = byId('unit-form');
  const modelPicker = byId('model-picker');
  const unitPicker = byId('unit-picker');
  const modelFeedback = byId('model-feedback');
  const unitFeedback = byId('unit-feedback');
  const capacityPanel = byId('capacity-panel');
  const capacityList = byId('capacity-list');
  const capacityFeedback = byId('capacity-feedback');
  const guestList = byId('guest-capability-list');
  const guestFeedback = byId('guest-capability-feedback');
  const modelFields = modelForm.elements;
  const unitFields = unitForm.elements;
  let modelos = [];
  let unidades = [];
  let catalogo = [];

  function cargarCapacidades(modelo) {
    capacityPanel.hidden = !modelo;
    if (!modelo) {
      capacityPanel.open = false;
      capacityList.replaceChildren();
      guestList.replaceChildren();
      return;
    }
    const habilitados = new Set(modelo.codigos ?? []);
    const comandos = new Map(catalogo.map(({ codigo, nombre }) => [codigo, prettyName(nombre)]));
    for (const codigo of habilitados) {
      if (!comandos.has(codigo)) comandos.set(codigo, `Comando ${codigo}`);
    }
    const opciones = Array.from(comandos, ([codigo, nombre]) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(codigo);
      checkbox.checked = habilitados.has(codigo);
      checkbox.className = 'form-check-input';
      label.append(checkbox, document.createTextNode(nombre));
      return label;
    });
    capacityList.replaceChildren(...opciones);
    byId('capacity-empty').hidden = opciones.length !== 0;
    byId('capacity-save').disabled = opciones.length === 0;
    const invitado = new Set(modelo.codigos_invitado ?? []);
    const elegibles = [1, 3, 4].filter((codigo) => habilitados.has(codigo));
    guestList.replaceChildren(...elegibles.map((codigo) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(codigo);
      checkbox.checked = invitado.has(codigo);
      checkbox.className = 'form-check-input';
      label.append(checkbox, document.createTextNode(comandos.get(codigo)));
      return label;
    }));
    byId('guest-capability-empty').hidden = elegibles.length > 0;
    byId('guest-capability-save').disabled = !elegibles.length;
  }

  function cargarModelo() {
    const actual = modelos.find((modelo) => String(modelo.id_modelo) === modelPicker.value);
    modelFields.nombre.value = actual?.nombre ?? '';
    modelFields.descripcion.value = actual?.descripcion ?? '';
    modelFields.activo.checked = actual?.activo ?? true;
    byId('model-active-field').hidden = !actual;
    byId('model-save').textContent = actual ? 'Guardar modelo' : 'Crear modelo';
    cargarCapacidades(actual);
  }

  function actualizarModeloObligatorio() {
    unitFields.id_modelo.required = !unitPicker.value || unitFields.estado_comercial.value !== 'inactivo';
  }

  function cargarUnidad() {
    const actual = unidades.find((unidad) => String(unidad.id_vehiculo) === unitPicker.value);
    const asignada = actual?.estado_comercial === 'asignado';
    const modelosVisibles = modelos.filter((modelo) => (modelo.activo || modelo.id_modelo === actual?.id_modelo));
    opciones(unitFields.id_modelo, [
      new Option(actual?.estado_comercial === 'inactivo' ? 'Sin modelo comercial' : 'Selecciona un modelo activo', ''),
      ...modelosVisibles.map((modelo) => new Option(modeloLabel(modelo), modelo.id_modelo)),
    ], String(actual?.id_modelo ?? ''));
    opciones(unitFields.estado_comercial, asignada
      ? [new Option('Asignada', 'asignado')]
      : estados.map(([codigo, etiqueta]) => new Option(etiqueta, codigo)), actual?.estado_comercial ?? 'disponible');
    unitFields.nombre.value = actual?.nombre ?? '';
    unitFields.descripcion.value = actual?.descripcion ?? '';
    unitFields.microcontrolador.value = actual?.microcontrolador ?? '';
    unitFields.id_modelo.disabled = asignada;
    unitFields.estado_comercial.disabled = asignada;
    actualizarModeloObligatorio();
    byId('unit-save').textContent = actual ? 'Guardar unidad' : 'Registrar unidad';
  }

  function setData(nuevosModelos, nuevasUnidades, nuevosComandos = []) {
    modelos = nuevosModelos;
    unidades = nuevasUnidades;
    catalogo = nuevosComandos;
    opciones(modelPicker, [new Option('Nuevo modelo', ''),
      ...modelos.map((modelo) => new Option(modeloLabel(modelo), modelo.id_modelo))]);
    opciones(unitPicker, [new Option('Nueva unidad', ''),
      ...unidades.map((unidad) => new Option(`${unidad.nombre} · ${unidad.id_vehiculo}`, unidad.id_vehiculo))]);
    cargarModelo();
    cargarUnidad();
  }

  modelPicker.addEventListener('change', () => {
    feedback(modelFeedback, '');
    feedback(capacityFeedback, '');
    feedback(guestFeedback, '');
    cargarModelo();
  });
  unitPicker.addEventListener('change', () => {
    feedback(unitFeedback, '');
    cargarUnidad();
  });
  unitFields.estado_comercial.addEventListener('change', actualizarModeloObligatorio);

  byId('capacity-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const id = modelPicker.value;
    if (!id) return;
    const codigos = Array.from(capacityList.querySelectorAll('input:checked'), (input) => Number(input.value));
    mutate(() => saveCapabilities(id, codigos), 'Comandos guardados.', capacityFeedback);
  });

  byId('guest-capability-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const id = modelPicker.value;
    if (!id) return;
    const codigos = Array.from(guestList.querySelectorAll('input:checked'), (input) => Number(input.value));
    mutate(() => saveGuestCapabilities(id, codigos), 'Mandos de exhibición guardados.', guestFeedback);
  });

  modelForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = modelPicker.value;
    const data = { nombre: modelFields.nombre.value.trim(), descripcion: opcional(modelFields.descripcion.value) };
    if (id) data.activo = modelFields.activo.checked;
    mutate(() => id ? saveModel(id, data) : createModel(data), id ? 'Modelo guardado.' : 'Modelo creado.', modelFeedback);
  });

  unitForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = unitPicker.value;
    const estado = unitFields.estado_comercial.value;
    const data = {
      nombre: unitFields.nombre.value.trim(),
      descripcion: opcional(unitFields.descripcion.value),
      microcontrolador: opcional(unitFields.microcontrolador.value),
      id_modelo: Number(unitFields.id_modelo.value) || null,
      estado_comercial: estado === 'asignado' ? null : estado,
    };
    const message = estado === 'inactivo' ? 'Unidad guardada como inactiva.' : (id ? 'Unidad guardada.' : 'Unidad registrada.');
    mutate(() => id ? saveUnit(id, data) : createUnit(data), message, unitFeedback);
  });

  return {
    setData,
    setBlocked(blocked) {
      byId('model-fields').disabled = blocked;
      byId('unit-fields').disabled = blocked;
      byId('capacity-fields').disabled = blocked;
      byId('guest-capability-fields').disabled = blocked;
    },
    reset() {
      setData([], []);
      feedback(modelFeedback, '');
      feedback(unitFeedback, '');
      feedback(capacityFeedback, '');
      feedback(guestFeedback, '');
    },
  };
}
