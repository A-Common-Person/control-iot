import { deleteMovementPreset, getDemoEditor, getEditableDemo, saveEditableDemo, saveMovementPreset } from './api.js';
import { friendlyMessage } from './errors.js';
import { prettyName } from './utils.js';

const MAX_PASOS = 20;
const MAX_TOTAL_MS = 30_000;

export function initDemoEditor(root, { onSave } = {}) {
  root.append(document.getElementById('demo-editor-template').content.cloneNode(true));
  const form = root.querySelector('form');
  const fields = form.querySelector('fieldset');
  const picker = root.querySelector('[data-demo-picker]');
  const add = form.querySelector('[data-demo-add]');
  const movementPicker = root.querySelector('[data-movement-picker]');
  const movementDelete = root.querySelector('[data-movement-delete]');
  const movementEditor = root.querySelector('[data-movement-editor]');
  const movementForm = root.querySelector('[data-movement-form]');
  const movementFields = movementForm.querySelector('fieldset');
  const movementCommand = movementForm.elements.comando_movimiento;
  const reset = form.querySelector('[data-demo-reset]');
  const rows = form.querySelector('ol');
  const total = form.querySelector('output');
  const feedback = root.querySelector('[data-demo-feedback]');
  const configurar = root.querySelector('#demo-configure-unit');
  let unidad = null;
  let revision = 0;
  let guardando = false;
  let comandos = [];
  let demos = [];
  let movimientos = [];
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
    movementFields.disabled = bloqueado;
    movementForm.querySelector('[type=submit]').disabled = !comandos.length;
  }

  function actualizarBotonesPasos() {
    add.disabled = !comandos.length || pasos.length >= MAX_PASOS;
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
      selector.setAttribute('aria-label', `Movimiento del paso ${posicion + 1}`);
      const [vacio, ...bases] = opcionesComandos();
      const habilitado = comandos.some((c) => c.id_comando === paso.id_comando);
      vacio.textContent = paso.id_comando && !habilitado ? 'Movimiento base deshabilitado' : 'Selecciona un movimiento';
      const grupoBase = document.createElement('optgroup');
      grupoBase.label = 'Movimientos base';
      grupoBase.append(...bases);
      selector.append(vacio, grupoBase);
      const grupo = document.createElement('optgroup');
      grupo.label = 'Movimientos personalizados';
      for (const mov of movimientos) {
        const option = new Option(mov.nombre, `m${mov.id_movimiento}`);
        option.disabled = !comandos.some((c) => c.id_comando === mov.id_comando);
        grupo.append(option);
      }
      if (grupo.children.length) selector.append(grupo);
      if (habilitado && paso.nombre_movimiento) {
        selector.append(new Option(`${paso.nombre_movimiento} · guardado en este paso`, 'guardado'));
        selector.value = 'guardado';
      } else selector.value = habilitado ? String(paso.id_comando) : '';
      selector.addEventListener('change', () => {
        const mov = movimientos.find((m) => `m${m.id_movimiento}` === selector.value);
        if (mov) {
          Object.assign(paso, { nombre_movimiento: mov.nombre, id_comando: mov.id_comando,
            duracion_ms: mov.duracion_ms, pausa_ms: mov.pausa_ms });
        } else {
          paso.nombre_movimiento = null;
          paso.id_comando = Number(selector.value);
        }
        pintarPasos();
        rows.children[posicion].querySelector('select').focus();
      });
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
    pasos = (demo?.pasos ?? []).map((paso) => ({ ...paso }));
    pintarPasos();
  }

  function pintarLista() {
    const opciones = () => demos.map((demo) => {
      return new Option(demo.activo ? demo.nombre : `${demo.nombre} (inactiva)`, demo.id_demo);
    });
    picker.replaceChildren(new Option('Nueva demo', ''), ...opciones());
    picker.value = seleccion?.id_demo ?? '';
    actualizarBotonesPasos();
  }

  function guardarEnLista(data) {
    demos = [...demos.filter((demo) => demo.id_demo !== data.id_demo), data]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id_demo - b.id_demo);
    pintarLista();
  }

  function aplicarComandos(nuevos) {
    comandos = nuevos;
    const anterior = movementCommand.value;
    movementCommand.replaceChildren(...opcionesComandos());
    if (anterior && comandos.some((c) => String(c.id_comando) === anterior)) movementCommand.value = anterior;
    if (configurar) configurar.hidden = comandos.some((c) => c.codigo !== 9);
    pintarPasos();
  }

  async function actualizarComandos(id) {
    if (unidad !== id) return;
    const solicitud = revision;
    try {
      const { data } = await getDemoEditor(id);
      if (revision !== solicitud) return;
      aplicarComandos(data.comandos);
      bloquear(fields.disabled);
      avisar();
    } catch (error) {
      if (revision === solicitud) avisar(friendlyMessage(error), 'error');
    }
  }

  async function select(id) {
    if (unidad === id && !picker.disabled) return;
    const solicitud = ++revision;
    unidad = id;
    guardando = false;
    bloquear(true);
    comandos = [];
    if (configurar) configurar.hidden = true;
    demos = [];
    movimientos = [];
    movementEditor.open = false;
    movementForm.reset();
    listarMovimientos();
    movementCommand.replaceChildren(...opcionesComandos());
    cargarFormulario();
    pintarLista();
    avisar(id ? 'Consultando demos…' : 'Selecciona una unidad.');
    if (id === null) return;
    try {
      const { data } = await getDemoEditor(id);
      if (revision !== solicitud) return;
      demos = data.demos;
      movimientos = data.movimientos;
      listarMovimientos();
      aplicarComandos(data.comandos);
      pintarLista();
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
  function listarMovimientos(id = '') {
    movementPicker.replaceChildren(new Option('Nuevo movimiento', ''), ...movimientos.map(
      (mov) => new Option(mov.nombre, mov.id_movimiento),
    ));
    movementPicker.value = String(id);
    cargarMovimiento();
  }

  function cargarMovimiento() {
    const mov = movimientos.find((m) => m.id_movimiento === Number(movementPicker.value));
    movementForm.elements.nombre_movimiento.value = mov?.nombre ?? '';
    movementCommand.value = mov?.id_comando ?? '';
    movementForm.elements.duracion_movimiento.value = mov?.duracion_ms ?? 300;
    movementForm.elements.pausa_movimiento.value = mov?.pausa_ms ?? 0;
    movementDelete.disabled = !mov;
  }
  movementPicker.addEventListener('change', cargarMovimiento);
  reset.addEventListener('click', () => {
    cargarFormulario(seleccion);
    avisar();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!unidad || guardando) return;
    if (!pasos.length || pasos.length > MAX_PASOS || actualizarTotal() > MAX_TOTAL_MS) {
      avisar('Agrega entre 1 y 20 pasos y deja la duración total en 30 s o menos.', 'error');
      return;
    }
    const solicitud = ++revision;
    const datos = {
      nombre: form.elements.nombre.value.trim(),
      descripcion: form.elements.descripcion.value.trim() || null,
      activo: form.elements.activo.checked,
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
  async function modificarMovimiento(borrar) {
    if (!unidad || guardando || movementFields.disabled) return;
    const id = Number(movementPicker.value);
    const nombre = movementForm.elements.nombre_movimiento.value.trim();
    if (borrar) {
      const actual = movimientos.find((m) => m.id_movimiento === id);
      if (!actual || !window.confirm(`¿Borrar el movimiento «${actual.nombre}»? Las demos guardadas conservarán sus pasos.`)) return;
    } else if (!nombre) {
      avisar('Escribe el nombre del movimiento.', 'error');
      return;
    }
    const solicitud = ++revision;
    guardando = true;
    bloquear(true);
    try {
      let seleccionado = '';
      if (borrar) {
        await deleteMovementPreset(unidad, id);
        if (solicitud !== revision) return;
        movimientos = movimientos.filter((m) => m.id_movimiento !== id);
      } else {
        const { data } = await saveMovementPreset(unidad, id, {
          nombre, id_comando: Number(movementCommand.value),
          duracion_ms: movementForm.elements.duracion_movimiento.valueAsNumber,
          pausa_ms: movementForm.elements.pausa_movimiento.valueAsNumber,
        });
        if (solicitud !== revision) return;
        movimientos = [...movimientos.filter((m) => m.id_movimiento !== data.id_movimiento), data]
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id_movimiento - b.id_movimiento);
        seleccionado = data.id_movimiento;
      }
      listarMovimientos(seleccionado);
      pintarPasos();
      avisar(borrar ? 'Movimiento borrado.' : 'Movimiento guardado.', 'ok');
      onSave?.();
    } catch (error) {
      if (solicitud === revision) avisar(friendlyMessage(error), 'error');
    } finally {
      if (solicitud === revision) {
        guardando = false;
        bloquear(false);
      }
    }
  }
  movementForm.addEventListener('submit', (event) => {
    event.preventDefault();
    modificarMovimiento(false);
  });
  movementDelete.addEventListener('click', () => modificarMovimiento(true));
  return { select, actualizarComandos };
}
