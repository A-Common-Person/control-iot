# Control IoT

Aplicación web de **CONTROL** para un vehículo IoT (Excavadora IoT). Es un frontend estático
(HTML5, CSS3, Bootstrap 5 y JavaScript con módulos nativos) publicado en GitHub Pages. Consume la
API FastAPI desplegada en AWS (REST por HTTPS) y mantiene una sesión WebSocket (WSS) con la misma API.

No incluye monitoreo, administración ni acceso directo a la base de datos. No se conecta al microcontrolador.

## Estructura

```
control-iot/
├─ index.html          Página única (HTML semántico)
├─ css/styles.css      Estilos propios sobre Bootstrap 5
├─ assets/favicon.svg  Favicon y logotipo
└─ js/
   ├─ app.js           Arranque y conexión entre módulos
   ├─ config.js        URLs públicas (sin secretos)
   ├─ api.js           Cliente REST (fetch, timeout, errores)
   ├─ errors.js        Errores y mensajes amigables
   ├─ state.js         Datos del vehículo, catálogo y estado de DEMO
   ├─ commands.js      Única vía de envío de comandos (prioridad de DETENER, sin duplicados)
   ├─ joystick.js      Joystick con Pointer Events y teclado
   ├─ demo.js          Iniciar y cancelar DEMO, eventos de DEMO
   ├─ websocket.js     Sesión WSS real y reconexión
   ├─ health.js        Comprobación periódica de /health (API y RDS)
   └─ ui.js            Único módulo que modifica el DOM
```

## Ejecución local

Los módulos ES no funcionan abriendo el archivo con doble clic. Desde la carpeta del proyecto:

```
python -m http.server 5500
```

y abre `http://localhost:5500`. Si el navegador rechaza los módulos por tipo MIME (Windows), usa:

```
python -c "import http.server as h; h.SimpleHTTPRequestHandler.extensions_map['.js']='text/javascript'; h.test(HandlerClass=h.SimpleHTTPRequestHandler, port=5500)"
```

El puerto 5500 y `https://a-common-person.github.io` son los orígenes que el backend permite por CORS.
Si usas un bloqueador de anuncios (por ejemplo Brave Shields), desactívalo para el sitio: puede bloquear el WebSocket.

## Integración con la API

Los contratos se tomaron del `openapi.json` real. Nada está inventado.

| Uso                       | Método y ruta                                                         |
| ------------------------- | --------------------------------------------------------------------- |
| Vehículo, comandos y DEMO | `GET /vehiculos/{id}`                                                 |
| Movimiento individual     | `POST /vehiculos/{id}/movimientos` con `{"id_comando": N}`            |
| Iniciar DEMO              | `POST /vehiculos/{id}/demos/{id_demo}/iniciar` (requiere `X-API-Key`) |
| Cancelar DEMO             | `POST /vehiculos/{id}/demos/cancelar` (requiere `X-API-Key`)          |
| Salud de la API y de RDS  | `GET /health` → `{"api": "ok", "database": "ok" \| "error"}`          |
| WebSocket                 | `wss://<host>/ws/vehiculos/{id}`                                      |

Eventos WebSocket: `estado_actual` (al conectar), `movimiento`, `demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`.

## Indicadores de conexión

- **WebSocket WSS:** estado de la sesión del navegador con el servidor. No demuestra que el vehículo físico esté conectado.
- **API AWS · 21 servicios:** resultado de `/health`. No confirma que las 21 rutas funcionen.
- **Amazon RDS:** solo según el campo `database` de `/health`; si la API no responde queda «Sin verificar».

## Verificación independiente del WebSocket

1. Abre una sesión WSS en Postmate, Thunder Client o una extensión de Chrome hacia `wss://<host>/ws/vehiculos/1`.
2. Acciona un control en la página. Debe llegar un evento `movimiento` con el mismo comando y código.
3. Inicia una DEMO: deben llegar `demo_inicio`, los `demo_movimiento` en orden y `demo_fin` (o `demo_cancelada`).

Un evento WebSocket confirma que el backend lo publicó, no que los motores se movieron.

## Seguridad

- No hay claves ni credenciales en el repositorio.
- La clave de operador (necesaria para iniciar y cancelar DEMO) se escribe en la página y solo se guarda en `sessionStorage` de la pestaña.
- Los datos remotos se insertan en el DOM solo con `textContent`.
- CORS en el backend limitado a los orígenes de la aplicación, a los métodos `GET` y `POST` y a las cabeceras `Content-Type` y `X-API-Key`.
