import { CONFIG } from './config.js';

// Utilidades de presentación.
const SMALL_WORDS = new Set(['a', 'de', 'del', 'la', 'el', 'y', 'en']);

// "DIAGONAL_DERECHA" -> "Diagonal Derecha"; "GIRAR_A_DERECHA" -> "Girar a Derecha"
export function prettyName(name) {
  return String(name)
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

// ----- Fecha y hora -----
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

// Convierte un texto ISO en Date. Si no trae zona (como fecha_hora de la BD) se interpreta
// según CONFIG.DB_NAIVE_TIME_ZONE. Devuelve null si falta o es inválido: nunca inventa una fecha.
export function parseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let text = value.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (!HAS_ZONE.test(text) && CONFIG.DB_NAIVE_TIME_ZONE === 'UTC') text += 'Z';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function makeFormatter(options) {
  try {
    return new Intl.DateTimeFormat('es-MX', { timeZone: CONFIG.DISPLAY_TIME_ZONE, ...options });
  } catch {
    return new Intl.DateTimeFormat('es-MX', options);
  }
}
const dateFormat = makeFormatter({ day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormat = makeFormatter({ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export const formatDate = (date) => (date ? dateFormat.format(date) : '—');
export const formatTime = (date) => (date ? timeFormat.format(date) : '—');