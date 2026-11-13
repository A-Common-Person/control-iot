// DOM de MONITOREO. Todo texto remoto se inserta con textContent.
const $ = (id) => document.getElementById(id);

const ICONS = [
  ['avanzar', 'bi-arrow-up-circle-fill'],
  ['retroceder', 'bi-arrow-down-circle-fill'],
  ['derecha', 'bi-arrow-clockwise'],
  ['izquierda', 'bi-arrow-counterclockwise'],
  ['subir', 'bi-arrow-bar-up'],
  ['bajar', 'bi-arrow-bar-down'],
  ['detener', 'bi-sign-stop-fill'],
  ['luz', 'bi-lightbulb-fill'],
  ['sonido', 'bi-volume-up-fill'],
  ['velocidad', 'bi-speedometer2'],
  ['demo', 'bi-play-btn-fill'],
];
function iconFor(name) {
  const text = String(name ?? '').toLowerCase();
  return ICONS.find(([word]) => text.includes(word))?.[1] ?? 'bi-record-circle';
}

// state: 'loading' | 'empty' | 'data' | 'stale' | 'error'
export function renderCard({ state, name, code, date, time, vehicle, type, origin, note }) {
  const card = $('last-card');
  card.dataset.state = state;
  const hasData = state === 'data' || state === 'stale';
  $('last-name').textContent = hasData ? name
    : { loading: 'Cargando…', empty: 'Sin movimientos', error: 'Sin datos' }[state];
  $('last-icon').className = `bi ${hasData ? iconFor(name) : 'bi-hourglass-split'}`;
  $('last-date').textContent = hasData ? date : '—';
  $('last-time').textContent = hasData ? time : '—';
  const extra = [];
  if (hasData && Number.isFinite(code)) extra.push(`Código ${code}`);
  if (vehicle) extra.push(String(vehicle).slice(0, 60));
  if (hasData && type) extra.push(type);
  if (hasData && origin) extra.push(`Origen: ${String(origin).slice(0, 20)}`);
  $('last-extra').textContent = extra.join(' · ');
  $('last-note').textContent = note ?? '';
}

export function renderDemoLine(text) {
  const line = $('demo-line');
  line.hidden = !text;
  line.textContent = text ?? '';
}

export function setHistoryStatus(text, level = 'info') {
  const box = $('history-status');
  box.textContent = text;
  box.dataset.level = level;
}

function messageRow(text) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 6;
  td.className = 'table-empty';
  td.textContent = text;
  tr.append(td);
  return tr;
}
export function renderHistoryMessage(text) {
  $('history-body').replaceChildren(messageRow(text));
}

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

// rows: [{ n, name, code, date, time, id }]; newIds: ids que no estaban en la consulta anterior
export function renderHistory(rows, newIds = new Set()) {
  const body = $('history-body');
  if (rows.length === 0) return body.replaceChildren(messageRow('Sin registros'));
  body.replaceChildren(...rows.map((row) => {
    const tr = document.createElement('tr');
    tr.dataset.id = String(row.id);
    if (newIds.has(row.id)) tr.className = 'is-new';
    tr.append(
      cell(String(row.n), 'num'),
      cell(row.name),
      cell(Number.isFinite(row.code) ? String(row.code) : '—', 'col-optional'),
      cell(row.date),
      cell(row.time),
      cell(String(row.id), 'col-optional muted'),
    );
    return tr;
  }));
}