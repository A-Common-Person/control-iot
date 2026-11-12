// Joystick circular con Pointer Events (mouse y pantalla táctil) y teclado (flechas).
// Solo informa cuando cambia la dirección efectiva: nunca por cada píxel o fotograma.
const DEADZONE = 0.35;           // fracción del recorrido máximo que cuenta como "neutral"
const TRAVEL = 0.3;              // recorrido máximo del botón, como fracción del ancho
const KEY_TO_DIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const DIR_VECTOR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Elige entre las 4 direcciones; mantiene la anterior cerca de las diagonales para evitar parpadeo.
function pickDirection(dx, dy, previous) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const candidate = ax > ay ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  if (previous && previous !== candidate) {
    const along = { left: -dx, right: dx, up: -dy, down: dy }[previous];
    const across = previous === 'left' || previous === 'right' ? ay : ax;
    if (along > 0 && along >= across * 0.8) return previous;
  }
  return candidate;
}

export function createJoystick(root, { onChange }) {
  const knob = root.querySelector('.knob');
  let pointerId = null;
  let current = null;
  root.tabIndex = 0;

  function moveKnob(x, y) {
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function setDirection(dir) {
    if (dir === current) return;
    current = dir;
    root.querySelectorAll('.dir').forEach((el) => el.classList.remove('is-active'));
    if (dir) root.querySelector(`.dir.${dir}`)?.classList.add('is-active');
    onChange(dir);
  }

  function reset() {
    pointerId = null;
    moveKnob(0, 0);
    setDirection(null);
  }

  function update(e) {
    const rect = root.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const max = rect.width * TRAVEL;
    const dist = Math.hypot(dx, dy);
    const k = dist > max ? max / dist : 1;
    moveKnob(dx * k, dy * k);
    setDirection(dist < max * DEADZONE ? null : pickDirection(dx, dy, current));
  }

  root.addEventListener('pointerdown', (e) => {
    if (pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointerId = e.pointerId;
    root.setPointerCapture(e.pointerId);
    update(e);
    e.preventDefault();
  });
  root.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) update(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) =>
    root.addEventListener(type, (e) => { if (e.pointerId === pointerId) reset(); }));
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // Teclado: flechas mientras el joystick tiene el foco
  root.addEventListener('keydown', (e) => {
    const dir = KEY_TO_DIR[e.key];
    if (!dir) return;
    e.preventDefault();
    if (e.repeat) return;
    const [vx, vy] = DIR_VECTOR[dir];
    const reach = root.clientWidth * 0.25;
    moveKnob(vx * reach, vy * reach);
    setDirection(dir);
  });
  root.addEventListener('keyup', (e) => { if (KEY_TO_DIR[e.key] === current) reset(); });

  // Seguridad: si se pierde el foco o la pestaña, se suelta el control
  root.addEventListener('blur', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  return { reset };
}
