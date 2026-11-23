import { getDemoEditor, getEditableDemo, saveEditableDemo } from './api.js';
import { friendlyMessage } from './errors.js';
import { prettyName } from './utils.js';

const MAX_PASOS = 20;
const MAX_TOTAL_MS = 30_000;
const DESCRIPCION_MOVIMIENTO = 'Movimiento reutilizable. Solo se usa como paso de otra demo.';

const esMovimiento = (demo) => demo?.activo === false && demo.descripcion === DESCRIPCION_MOVIMIENTO;

export function initDemoEditor(root, { onSave } = {}) {
  root.append(document.getElementById('demo-editor-template').content.cloneNode(true));
  const form = root.querySelector('form');
  const fields = form.querySelector('fieldset');
  const picker = root.querySelector('[data-demo-picker]');
  const add = form.querySelector('[data-demo-add]');
  const movementPicker = form.querySelector('[data-movement-picker]');
  const movementAdd = form.querySelector('[data-movement-add]');
  const movementEditor = root.querySelector('[data-movement-editor]');
  const movementForm = root.querySelector('[data-movement-form]');
  const movementFields = movementForm.querySelector('fieldset');
  const movementCommand = movementForm.elements.comando_movimiento;
  const reset = form.querySelector('[data-demo-reset]');
  const rows = form.querySelector('ol');
  const total = form.querySelector('output');
  const feedback = root.querySelector('[data-demo-feedback]');
  let unidad = null;
  let revision = 0;
  let guardando = false;
  let comandos = [];
  let demos = [];
  let seleccion = null;
  let pasos = [];

  function avisar(mensaje = '', nivel = '') {
    feedback.textContent = mensaje;
    feedback.dataset.level = nivel;
  }

  function actualizarTotal() {
    const milisegundos = pasos.reduce((suma, paso) => suma + paso.duracion_ms + paso.pausa_ms, 0);
    total.textContent = `${(milisegundos / 1000).toLocaleString('es-MX')} s de 30 s`;
    total.dataset.level = milisegundos > MAX_TOTAL_MS ? 'error' : '';
    return milisegundos;
  }

  function opcionesComandos() {
    return [new Option('Selecciona un comando', ''), ...comandos.map((comando) => (
      new Option(`${prettyName(comando.nombre)} · ${comando.codigo}`, comando.id_comando)
    ))];
  }

  function bloquear(bloqueado) {
    picker.disabled = fields.disabled = bloqueado;
    movementFields.disabled = bloqueado || !comandos.length;
  }

  function actualizarBotonesPasos() {
    const limite = esMovimiento(seleccion) ? 1 : MAX_PASOS;
    add.disabled = !comandos.length || pasos.length >= limite;
    movementPicker.disabled = add.disabled || movementPicker.options.length < 2;
    movementAdd.disabled = movementPicker.disabled || !movementPicker.value;
  }

  function moverPaso(desde, hasta) {
    [pasos[desde], pasos[hasta]] = [pasos[hasta], pasos[desde]];
    pintarPasos();
    rows.children[hasta].querySelector('select').focus();
  }

  function pintarPasos() {
    rows.replaceChildren();
    for (const [posicion, paso] of pasos.entries()) {
      const fila = document.createElement('li');
      fila.className = 'demo-editor-step';
      const selector = document.createElement('select');
      selector.className = 'form-select';
      selector.required = true;
      selector.setAttribute('aria-label', `Comando del paso ${posicion + 1}`);
      selector.append(...opcionesComandos());
      if (paso.id_comando && !comandos.some((comando) => comando.id_comando === paso.id_comando)) {
        selector.options[0].textContent = 'Comando anterior no habilitado';
      }
      selector.value = comandos.some((comando) => comando.id_comando === paso.id_comando) ? paso.id_comando : '';
      selector.addEventListener('change', () => { paso.id_comando = Number(selector.value); });
      fila.append(selector);

      for (const [campo, texto, minimo] of [['duracion_ms', 'Duración (ms)', 100], ['pausa_ms', 'Pausa (ms)', 0]]) {
        const label = document.createElement('label');
        label.textContent = texto;
        const input = document.createElement('input');
        input.className = 'form-control';
        input.type = 'number';
        input.min = minimo;
        input.max = 3000;
        input.required = true;
        input.value = paso[campo];
        input.addEventListener('input', () => {
          paso[campo] = Number(input.value);
          actualizarTotal();
        });
        label.append(input);
        fila.append(label);
      }

      const botones = document.createElement('div');
      botones.className = 'demo-step-actions';
      for (const [texto, deshabilitado, accion] of [
        ['Subir paso', posicion === 0, () => moverPaso(posicion, posicion - 1)],
        ['Bajar paso', posicion === pasos.length - 1, () => moverPaso(posicion, posicion + 1)],
        ['Quitar paso', false, () => { pasos.splice(posicion, 1); pintarPasos(); add.focus(); }],
      ]) {
        const button = document.createElement('button');
        button.className = 'btn btn-outline-light session-button';
        button.type = 'button';
        button.textContent = texto;
        button.disabled = deshabilitado;
        button.addEventListener('click', accion);
        botones.append(button);
      }
      fila.append(botones);
      rows.append(fila);
    }
    actualizarBotonesPasos();
    actualizarTotal();
  }

  function cargarFormulario(demo = null) {
    seleccion = demo;
    form.elements.nombre.value = demo?.nombre ?? '';
    form.elements.descripcion.value = demo?.descripcion ?? '';
    form.elements.activo.checked = demo?.activo ?? true;
    form.elements.activo.disabled = esMovimiento(demo);
    form.elements.descripcion.readOnly = esMovimiento(demo);
    pasos = (demo?.pasos ?? []).map((paso) => ({ ...paso }));
    pintarPasos();
  }

  function pintarLista() {
    const opciones = () => demos.map((demo) => {
      const estado = esMovimiento(demo) ? ' (movimiento)' : ' (inactiva)';
      return new Option(demo.activo ? demo.nombre : `${demo.nombre}${estado}`, demo.id_demo);
    });
    picker.replaceChildren(new Option('Nueva demo', ''), ...opciones());
    picker.value = seleccion?.id_demo ?? '';
    movementPicker.replaceChildren(new Option('Selecciona una demo de un paso', ''), ...opciones());
    actualizarBotonesPasos();
  }

  function guardarEnLista(data) {
    demos = [...demos.filter((demo) => demo.id_demo !== data.id_demo), data]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id_demo - b.id_demo);
    pintarLista();
  }

  async function select(id) {
    if (unidad === id && !picker.disabled) return;
    const solicitud = ++revision;
    unidad = id;
    guardando = false;
    bloquear(true);
    comandos = [];
    demos = [];
    movementEditor.open = false;
    movementForm.reset();
    movementCommand.replaceChildren(...opcionesComandos());
    cargarFormulario();
    pintarLista();
    avisar(id ? 'Consultando demos…' : 'Selecciona una unidad.');
    if (id === null) return;
    try {
      const { data } = await getDemoEditor(id);
      if (revision !== solicitud) return;
      demos = data.demos;
      comandos = data.comandos;
      movementCommand.replaceChildren(...opcionesComandos());
      pintarLista();
      pintarPasos();
      bloquear(false);
      avisar(comandos.length ? '' : 'La unidad aún no tiene comandos habilitados.');
    } catch (error) {
      if (revision === solicitud) avisar(friendlyMessage(error), 'error');
    }
  }

  picker.addEventListener('change', async () => {
    const id = Number(picker.value);
    if (!id) {
      cargarFormulario();
      avisar();
      return;
    }
    const solicitud = ++revision;
    bloquear(true);
    avisar('Cargando demo…');
    try {
      const { data } = await getEditableDemo(unidad, id);
      if (revision !== solicitud) return;
      cargarFormulario(data);
      avisar();
    } catch (error) {
      if (revision !== solicitud) return;
      picker.value = seleccion?.id_demo ?? '';
      avisar(friendlyMessage(error), 'error');
    } finally {
      if (revision === solicitud) bloquear(false);
    }
  });
  add.addEventListener('click', () => {
    pasos.push({ id_comando: 0, duracion_ms: 300, pausa_ms: 0 });
    pintarPasos();
    rows.lastElementChild.querySelector('select').focus();
  });
  movementPicker.addEventListener('change', actualizarBotonesPasos);
  movementAdd.addEventListener('click', async () => {
    if (movementAdd.disabled || !unidad) return;
    const solicitud = ++revision;
    const id = Number(movementPicker.value);
    bloquear(true);
    avisar('Consultando el movimiento guardado…');
    try {
      const { data } = await getEditableDemo(unidad, id);
      if (revision !== solicitud) return;
      if (data.pasos.length !== 1) {
        avisar('Selecciona una demo que tenga un solo paso.', 'error');
        return;
      }
      const [paso] = data.pasos;
      if (!comandos.some((comando) => comando.id_comando === paso.id_comando)) {
        avisar('El comando de ese movimiento ya no está habilitado para esta unidad.', 'error');
        return;
      }
      pasos.push({ ...paso });
      pintarPasos();
      avisar(`Movimiento «${data.nombre}» agregado.`, 'ok');
    } catch (error) {
      if (revision === solicitud) avisar(friendlyMessage(error), 'error');
    } finally {
      if (revision === solicitud) bloquear(false);
    }
  });
  reset.addEventListener('click', () => {
    cargarFormulario(seleccion);
    avisar();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!unidad || guardando) return;
    if (esMovimiento(seleccion) && pasos.length !== 1) {
      avisar('Un movimiento reutilizable debe tener un solo paso.', 'error');
      return;
    }
    if (!pasos.length || pasos.length > MAX_PASOS || actualizarTotal() > MAX_TOTAL_MS) {
      avisar('Agrega entre 1 y 20 pasos y deja la duración total en 30 s o menos.', 'error');
      return;
    }
    const solicitud = ++revision;
    const datos = {
      nombre: form.elements.nombre.value.trim(),
      descripcion: form.elements.descripcion.value.trim() || null,
      activo: !esMovimiento(seleccion) && form.elements.activo.checked,
      pasos,
    };
    guardando = true;
    bloquear(true);
    avisar('Guardando demo…');
    try {
      const { data } = await saveEditableDemo(unidad, seleccion?.id_demo, datos);
      if (revision !== solicitud) return;
      cargarFormulario(data);
      guardarEnLista(data);
      avisar('Demo guardada.', 'ok');
      onSave?.();
    } catch (error) {
      if (revision === solicitud) avisar(friendlyMessage(error), 'error');
    } finally {
      if (revision === solicitud) {
        guardando = false;
        bloquear(false);
      }
    }
  });
  movementForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!unidad || guardando || movementFields.disabled) return;
    const nombre = movementForm.elements.nombre_movimiento.value.trim();
    if (!nombre) {
      avisar('Escribe el nombre del movimiento.', 'error');
      return;
    }
    const solicitud = ++revision;
    const movimiento = {
      nombre,
      descripcion: DESCRIPCION_MOVIMIENTO,
      activo: false,
      pasos: [{
        id_comando: Number(movementCommand.value),
        duracion_ms: movementForm.elements.duracion_movimiento.valueAsNumber,
        pausa_ms: movementForm.elements.pausa_movimiento.valueAsNumber,
      }],
    };
    guardando = true;
    bloquear(true);
    avisar('Guardando movimiento…');
    try {
      const { data } = await saveEditableDemo(unidad, null, movimiento);
      if (revision !== solicitud) return;
      guardarEnLista(data);
      movementPicker.value = data.id_demo;
      actualizarBotonesPasos();
      movementForm.reset();
      movementEditor.open = false;
      avisar(`Movimiento «${data.nombre}» guardado en Demo de origen.`, 'ok');
      onSave?.();
    } catch (error) {
      if (revision === solicitud) avisar(friendlyMessage(error), 'error');
    } finally {
      if (revision === solicitud) {
        guardando = false;
        bloquear(false);
      }
    }
  });
  return { select };
}
