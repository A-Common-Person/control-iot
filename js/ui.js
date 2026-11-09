// Todo lo que toca el DOM. Los datos remotos se insertan solo con textContent.
const $ = (id) => document.getElementById(id);

export function setVehicleName(text) {
  $('vehicle-name').textContent = text;
}

export function setAction(text, level = 'info') {
  const bar = $('action-bar');
  const time = new Date().toLocaleTimeString('es-MX', { hour12: false });
  bar.textContent = `${time} · ${text}`;
  bar.dataset.level = level;
}

export function renderDemos(demos) {
  const select = $('demo-select');
  select.replaceChildren();
  if (demos.length === 0) {
    select.append(new Option('No hay DEMO disponibles', ''));
    select.disabled = true;
    return;
  }
  select.append(new Option('Selecciona una DEMO…', ''));
  demos.forEach((d) => select.append(new Option(d.nombre, String(d.id_demo))));
  select.disabled = false;
}

// Deshabilita los botones auxiliares cuyo comando no existe en el catálogo.
export function markAvailableCommands(findCommand) {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    const available = Boolean(findCommand(btn.dataset.action));
    btn.disabled = !available;
    btn.title = available ? '' : 'Este comando no está en el catálogo del vehículo';
  });
}