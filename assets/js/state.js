// Estado de la aplicación (datos del vehículo). Sin acceso al DOM ni a la red.
const state = {
  vehicle: null,
  commands: [],
  demos: [],
};

export function setVehicle(data) {
  state.vehicle = { id: data.id_vehiculo, nombre: data.nombre };
  state.commands = data.comandos.filter((c) => c.activo);
  state.demos = data.demos.filter((d) => d.activo);
}

export const getVehicleInfo = () => state.vehicle;
export const getDemos = () => state.demos;

// Los comandos se buscan por nombre en el catálogo real; no se codifican IDs.
export function findCommand(name) {
  const wanted = String(name).trim().toLowerCase();
  return state.commands.find((c) => c.nombre.trim().toLowerCase() === wanted) ?? null;
}

// La DEMO la ejecuta el backend; este indicador evita comandos incompatibles mientras corre.
let demoRunning = false;
export const isDemoRunning = () => demoRunning;
export const setDemoRunning = (value) => { demoRunning = Boolean(value); };

// Luz y Sonido inician activados. Es el estado supuesto según los comandos aceptados por la API
// desde esta página; no confirma el estado físico del vehículo.
const toggles = { luz: true, sonido: true };
export const getToggle = (action) => toggles[action];
export const flipToggle = (action) => { toggles[action] = !toggles[action]; return toggles[action]; };