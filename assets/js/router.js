// Navegación dentro de la misma página según las vistas disponibles para la sesión.
const VIEWS = {
  control: { id: 'view-control', title: 'Control IoT · Excavadora' },
  monitoreo: { id: 'view-monitor', title: 'Monitoreo IoT · Excavadora' },
  administracion: { id: 'view-admin', title: 'Administración · IoT' },
  acceso: { id: 'view-login', title: 'Iniciar sesión · IoT' },
  invitado: { id: 'view-exhibition', title: 'Exhibición · IoT' },
};

const DEFAULT_VIEWS = ['control', 'monitoreo'];

export function getCurrentView() {
  return document.body.dataset.view ?? 'control';
}

export function initRouter({ onChange, allowed = () => DEFAULT_VIEWS }) {
  const nav = document.querySelector('.view-nav');

  function refresh(moveFocus = false) {
    const available = allowed();
    const requested = window.location.hash.slice(1);
    const name = available.includes(requested) ? requested : available[0];
    Object.entries(VIEWS).forEach(([key, view]) => {
      document.getElementById(view.id).hidden = key !== name;
    });
    nav.hidden = name === 'acceso' || name === 'invitado';
    document.querySelectorAll('.view-tab').forEach((tab) => {
      tab.hidden = !available.includes(tab.dataset.view);
      if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    document.body.dataset.view = name;
    document.title = VIEWS[name].title;
    if (moveFocus) document.querySelector(`#${VIEWS[name].id} > h1`)?.focus();
    onChange(name);
  }
  window.addEventListener('hashchange', () => refresh(true));
  refresh();
  return { refresh };
}
