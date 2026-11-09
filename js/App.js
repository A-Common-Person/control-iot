import { CONFIG } from './config.js';
import { getVehicle } from './api.js';
import { setVehicle, getDemos, findCommand } from './state.js';
import { sendCommand } from './commands.js';
import { friendlyMessage } from './errors.js';
import * as ui from './ui.js';

async function loadVehicle() {
  try {
    const data = await getVehicle(CONFIG.VEHICLE_ID);
    setVehicle(data);
    ui.setVehicleName(`${data.nombre} · ID ${data.id_vehiculo}`);
    ui.renderDemos(getDemos());
    ui.markAvailableCommands(findCommand);
    ui.setAction('Catálogo cargado desde la API.', 'ok');
  } catch (err) {
    ui.setVehicleName('Vehículo no disponible');
    ui.setAction(friendlyMessage(err), 'error');
  }
}

document.getElementById('btn-stop').addEventListener('click', async () => {
  try {
    await sendCommand('DETENER');
  } catch (err) {
    ui.setAction(friendlyMessage(err), 'error');
  }
});

loadVehicle();