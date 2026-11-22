import { getDemoEditor, getEditableDemo, saveEditableDemo } from './api.js';
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
      selector.append(new Option('Selecciona un comando', ''), ...comandos.map((comando) => (
        new Option(`${prettyName(comando.nombre)} · ${comando.codigo}`, comando.id_comando)
      )));
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
    add.disabled = !comandos.length || pasos.length >= MAX_PASOS;
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
    picker.replaceChildren(new Option('Nueva demo', ''), ...demos.map((demo) => (
      new Option(demo.activo ? demo.nombre : `${demo.nombre} (inactiva)`, demo.id_demo)
    )));
    picker.value = seleccion?.id_demo ?? '';
  }

  async function select(id) {
    if (unidad === id && !picker.disabled) return;
    const solicitud = ++revision;
    unidad = id;
    guardando = false;
    picker.disabled = fields.disabled = true;
    comandos = [];
    demos = [];
    cargarFormulario();
    pintarLista();
    avisar(id ? 'Consultando demos…' : 'Selecciona una unidad.');
    if (id === null) return;
    try {
      const { data } = await getDemoEditor(id);
      if (revision !== solicitud) return;
      demos = data.demos;
      comandos = data.comandos;
      pintarLista();
      pintarPasos();
      picker.disabled = fields.disabled = false;
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
    picker.disabled = fields.disabled = true;
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
      if (revision === solicitud) picker.disabled = fields.disabled = false;
    }
  });
  add.addEventListener('click', () => {
    pasos.push({ id_comando: 0, duracion_ms: 300, pausa_ms: 0 });
    pintarPasos();
    rows.lastElementChild.querySelector('select').focus();
  });
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
    guardando = picker.disabled = fields.disabled = true;
    avisar('Guardando demo…');
    try {
      const { data } = await saveEditableDemo(unidad, seleccion?.id_demo, datos);
      if (revision !== solicitud) return;
      demos = [...demos.filter((demo) => demo.id_demo !== data.id_demo), data]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id_demo - b.id_demo);
      cargarFormulario(data);
      pintarLista();
      avisar('Demo guardada.', 'ok');
      onSave?.();
    } catch (error) {
      if (revision === solicitud) avisar(friendlyMessage(error), 'error');
    } finally {
      if (revision === solicitud) guardando = picker.disabled = fields.disabled = false;
    }
  });
  return { select };
}
