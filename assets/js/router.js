// Navegación entre CONTROL y MONITOREO dentro de la misma página (hash #control / #monitoreo).
// Una sola página mantiene una sola conexión WebSocket compartida entre las dos vistas.
const VIEWS = {
  control: { id: 'view-control', title: 'Control IoT · Excavadora' },
  monitoreo: { id: 'view-monitor', title: 'Monitoreo IoT · Excavadora' },
};

const currentFromHash = () => {
  const name = window.location.hash.replace('#', '');
  return Object.hasOwn(VIEWS, name) ? name : 'control';
};

export function getCurrentView() {
  return document.body.dataset.view ?? 'control';
}

export function initRouter({ onChange }) {
  function apply(name, moveFocus) {
    Object.entries(VIEWS).forEach(([key, view]) => {
      document.getElementById(view.id).hidden = key !== name;
    });
    document.querySelectorAll('.view-tab').forEach((tab) => {
      if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    document.body.dataset.view = name;
    document.title = VIEWS[name].title;
    if (moveFocus) document.querySelector(`#${VIEWS[name].id} > h1`)?.focus();
    onChange(name);
  }
  window.addEventListener('hashchange', () => apply(currentFromHash(), true));
  apply(currentFromHash(), false);
}