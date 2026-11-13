// Botón de pantalla completa (Fullscreen API). Alterna entrar y salir.
// Safari en iPhone no permite pantalla completa en páginas web: ahí el botón se oculta.
const root = document.documentElement;
const requestFs = root.requestFullscreen ?? root.webkitRequestFullscreen;
const exitFs = document.exitFullscreen ?? document.webkitExitFullscreen;
const isFullscreen = () => Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);

export function initFullscreen(button) {
  const supported = Boolean(requestFs && exitFs && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled));
  if (!supported) {
    button.hidden = true;
    return;
  }

  function render() {
    const on = isFullscreen();
    button.setAttribute('aria-pressed', String(on));
    const label = on ? 'Salir de pantalla completa' : 'Activar pantalla completa';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('i').className = `bi ${on ? 'bi-fullscreen-exit' : 'bi-fullscreen'}`;
  }

  button.addEventListener('click', async () => {
    try {
      if (isFullscreen()) await exitFs.call(document);
      else await requestFs.call(root, { navigationUI: 'hide' });
    } catch {
      /* el navegador puede negar la solicitud: no pasa nada */
    }
  });
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('webkitfullscreenchange', render);
  render();
}