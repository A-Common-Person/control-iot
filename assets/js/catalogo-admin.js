import { createModel, createUnit, saveModel, saveUnit } from './api.js';

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
  const modelFields = modelForm.elements;
  const unitFields = unitForm.elements;
  let modelos = [];
  let unidades = [];

  function cargarModelo() {
    const actual = modelos.find((modelo) => String(modelo.id_modelo) === modelPicker.value);
    modelFields.nombre.value = actual?.nombre ?? '';
    modelFields.descripcion.value = actual?.descripcion ?? '';
    modelFields.activo.checked = actual?.activo ?? true;
    byId('model-active-field').hidden = !actual;
    byId('model-save').textContent = actual ? 'Guardar modelo' : 'Crear modelo';
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

  function setData(nuevosModelos, nuevasUnidades) {
    modelos = nuevosModelos;
    unidades = nuevasUnidades;
    opciones(modelPicker, [new Option('Nuevo modelo', ''),
      ...modelos.map((modelo) => new Option(modeloLabel(modelo), modelo.id_modelo))]);
    opciones(unitPicker, [new Option('Nueva unidad', ''),
      ...unidades.map((unidad) => new Option(`${unidad.nombre} · ${unidad.id_vehiculo}`, unidad.id_vehiculo))]);
    cargarModelo();
    cargarUnidad();
  }

  modelPicker.addEventListener('change', () => {
    feedback(modelFeedback, '');
    cargarModelo();
  });
  unitPicker.addEventListener('change', () => {
    feedback(unitFeedback, '');
    cargarUnidad();
  });
  unitFields.estado_comercial.addEventListener('change', actualizarModeloObligatorio);

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
    },
    reset() {
      setData([], []);
      feedback(modelFeedback, '');
      feedback(unitFeedback, '');
    },
  };
}
