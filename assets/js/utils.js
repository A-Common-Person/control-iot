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