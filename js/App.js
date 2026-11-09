import { CONFIG } from './config.js';

// Fase 1: solo arranque. Los módulos (api, websocket, health, commands,
// joystick, demo, state, ui, errors) se agregan en las fases siguientes.
const vehicleName = document.getElementById('vehicle-name');
vehicleName.textContent = `Vehículo ID ${CONFIG.VEHICLE_ID}`;