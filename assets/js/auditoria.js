import { getAudit } from './api.js';
import { friendlyMessage } from './errors.js';
import { formatDate, formatTime, parseTimestamp, prettyName } from './utils.js';

const PAGINA = 25;
const ETIQUETAS = {
  id_usuario_creado: 'Cuenta creada',
  id_cliente: 'Comprador', cliente_anterior: 'Comprador anterior', id_asignacion: 'Asignación',
  id_asignacion_anterior: 'Asignación anterior', id_modelo: 'Modelo', id_modelo_anterior: 'Modelo anterior',
  id_demo: 'Demo', id_movimiento: 'Movimiento personalizado', id_comando: 'Comando base',
  nombre_movimiento: 'Nombre del paso', pasos_modificados: 'Posiciones modificadas',
  tipo: 'Tipo de demo', pasos: 'Número de pasos', codigos: 'Códigos', agregados: 'Habilitados',
  retirados: 'Retirados', habilitados: 'Habilitados', deshabilitados: 'Deshabilitados',
  duracion_ms: 'Duración', pausa_ms: 'Pausa', duracion_total_ms: 'Duración total',
  descripcion: 'Descripción', estado_comercial: 'Estado comercial', activo: 'Activo',
  nombre: 'Nombre', rol: 'Rol', segundos: 'Duración de la sesión', microcontrolador: 'Microcontrolador',
  motivo: 'Motivo', detencion_confirmada: 'Detención confirmada', estado_anterior: 'Estado anterior',
};
const CAMPOS_CODIGOS = ['codigos', 'agregados', 'retirados', 'habilitados', 'deshabilitados'];

export function initAuditoria(acciones) {
  const lista = document.getElementById('audit-rows');
  const anteriores = document.getElementById('audit-older');
  const aviso = document.getElementById('audit-feedback');
  let personas = new Map();
  let codigos = new Map();
  let visible = false;
  let revision = 0;
  let timer;
  let cargando = false;
  let primero = null;
  let ultimo = null;

  function valor(campo, v) {
    if (v == null || v === '') return 'Sin valor';
    if (campo === 'activo' || campo === 'detencion_confirmada') return v ? 'Sí' : 'No';
    if (Array.isArray(v)) {
      if (!v.length) return 'Ninguno';
      return v.map((x) => CAMPOS_CODIGOS.includes(campo) && codigos.has(x) ? `${codigos.get(x)} (#${x})` : x).join(', ');
    }
    if (campo === 'id_cliente' || campo === 'cliente_anterior') return `${personas.get(v) ?? 'Comprador'} (#${v})`;
    if (campo.endsWith('_ms')) return `${v} ms`;
    if (campo === 'segundos') return `${v} s`;
    if (campo === 'motivo') return prettyName(v);
    return String(v);
  }

  function fila(e) {
    const item = document.createElement('li');
    const titulo = document.createElement('strong');
    const d = e.detalle ?? {};
    titulo.textContent = [acciones[e.accion] ?? e.accion, d.nombre].filter(Boolean).join(' · ');
    const fecha = document.createElement('time');
    const when = parseTimestamp(e.ocurrio_en);
    if (when) fecha.dateTime = when.toISOString();
    fecha.textContent = `#${e.id_evento} · ${formatDate(when)} · ${formatTime(when)} (Ciudad de México)`;
    const contexto = document.createElement('span');
    const actor = e.id_usuario ? `${e.actor_nombre ?? 'Usuario'} (#${e.id_usuario})` :
      (e.accion.startsWith('invitado.') ? 'Invitado' : 'Sistema');
    contexto.textContent = [actor, e.actor_rol === 'usuario' ? 'Comprador' : e.actor_rol && prettyName(e.actor_rol),
      e.id_vehiculo && `${e.unidad_nombre ?? 'Unidad'} (#${e.id_vehiculo})`, e.id_reserva && `Reserva #${e.id_reserva}`]
      .filter(Boolean).join(' · ');
    item.append(titulo, fecha, contexto);
    const datos = document.createElement('dl');
    function agregar(etiqueta, texto) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = etiqueta;
      dd.textContent = texto;
      datos.append(dt, dd);
    }
    agregar('Resultado', e.accion === 'invitado.fin' && d.detencion_confirmada === false
      ? 'Reserva cerrada sin confirmación de DETENER' : 'Operación registrada');
    for (const [campo, v] of Object.entries(d)) {
      if (campo === 'cambios') {
        for (const [k, cambio] of Object.entries(v)) {
          if (ETIQUETAS[k]) agregar(ETIQUETAS[k], `${valor(k, cambio.antes)} → ${valor(k, cambio.despues)}`);
        }
      } else if (ETIQUETAS[campo] && campo !== 'nombre') agregar(ETIQUETAS[campo], valor(campo, v));
    }
    const detalle = document.createElement('details');
    const resumen = document.createElement('summary');
    resumen.textContent = 'Ver detalle';
    detalle.append(resumen, datos);
    item.append(detalle);
    return item;
  }

  async function cargar(anterioresPrimero = false) {
    if (!visible || cargando || document.hidden) return;
    const actual = revision;
    cargando = true;
    anteriores.disabled = true;
    clearTimeout(timer);
    let demora = 10000;
    try {
      const nuevos = !anterioresPrimero && primero !== null;
      const params = { limite: PAGINA + 1 };
      if (nuevos) params.despues_de = primero;
      if (anterioresPrimero) params.antes_de = ultimo;
      const pagina = await getAudit(params);
      if (actual !== revision) return;
      const validos = pagina.filter((e) => nuevos ? e.id_evento > primero : ultimo === null || e.id_evento < ultimo);
      const eventos = validos.slice(0, PAGINA);
      if (nuevos && eventos.length) {
        primero = eventos[eventos.length - 1].id_evento;
        lista.prepend(...eventos.reverse().map(fila));
        if (validos.length > PAGINA) demora = 0;
      } else if (!nuevos) {
        if (eventos.length) {
          primero ??= eventos[0].id_evento;
          ultimo = eventos[eventos.length - 1].id_evento;
          lista.append(...eventos.map(fila));
        }
        anteriores.hidden = validos.length <= PAGINA;
      }
      aviso.textContent = primero === null ? 'Todavía no hay eventos registrados.' : '';
    } catch (error) {
      if (actual === revision) aviso.textContent = friendlyMessage(error);
    } finally {
      if (actual === revision) {
        cargando = anteriores.disabled = false;
        timer = setTimeout(cargar, demora);
      }
    }
  }
  anteriores.addEventListener('click', () => cargar(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });
  return {
    cargar,
    catalogos(compradores, capacidades) {
      personas = new Map(compradores.map((p) => [p.id_usuario, p.nombre]));
      codigos = new Map(capacidades.map((c) => [c.codigo, prettyName(c.nombre)]));
      codigos.set(9, 'Detener');
    },
    mostrar(value) {
      if (visible === value) return;
      visible = value;
      revision++;
      cargando = false;
      clearTimeout(timer);
      primero = ultimo = null;
      lista.replaceChildren();
      anteriores.hidden = true;
      aviso.textContent = value ? 'Consultando auditoría…' : '';
      if (visible) cargar();
    },
  };
}
