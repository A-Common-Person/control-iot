# Control IoT

Aplicación web de CONTROL para un vehículo IoT (Excavadora IoT). Frontend estático publicado en GitHub Pages; consume la API FastAPI en AWS (REST por HTTPS y eventos por WSS).

## Estructura
- `index.html`: página única.
- `css/styles.css`: estilos propios sobre Bootstrap 5.
- `js/config.js`: URLs públicas (sin secretos).
- `js/app.js`: arranque. Los demás módulos se agregan por fases.
- `assets/`: favicon e imágenes.

## Ejecución local
Los módulos ES no funcionan abriendo el archivo con doble clic. Usa un servidor local:
`python -m http.server 5500` y abre `http://localhost:5500`.

## Integración con la API
Pendiente de documentar por fase (cliente REST, WebSocket, salud, DEMO).

## Seguridad
No se guardan claves ni credenciales en este repositorio.
