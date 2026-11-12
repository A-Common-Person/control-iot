# Control IoT

Aplicación web de **CONTROL** para un vehículo IoT (Excavadora IoT). Es un frontend estático
(HTML5, CSS3, Bootstrap 5 y JavaScript con módulos nativos) publicado en GitHub Pages. Envía las órdenes
a la API FastAPI desplegada en AWS (REST por HTTPS) y mantiene una sesión WebSocket (WSS) para recibir
los eventos que publica el backend.

- Página publicada: https://a-common-person.github.io/control-iot/
- API (Swagger): https://vehiculo-iot-erik.duckdns.org/docs

Es la primera de las tres aplicaciones del proyecto (Control, Monitoreo y Administración). No incluye monitoreo,
administración ni acceso directo a la base de datos, y no se conecta al microcontrolador.

## Qué hace

- **Mueve el vehículo** con dos joysticks virtuales (táctiles o con mouse) y con botones.
- **Detiene el vehículo** con prioridad sobre cualquier otra acción (botón DETENER o tecla Esc).
- **Ejecuta y cancela DEMO** que ya existen en la API. El orden, la duración y la pausa los respeta el backend.
- **Muestra tres indicadores independientes** de conexión: WebSocket, API AWS y Amazon RDS.
- **Muestra cada acción** como «Solicitado», «Aceptado por la API» y «evento recibido», sin afirmar nunca que el vehículo se movió.
- **Se adapta** a celular (vertical y horizontal, sin desplazamiento), tableta y escritorio.

## Controles y movimientos

Los comandos salen del catálogo real del vehículo en la API; la aplicación no inventa nombres ni códigos.

### Joystick izquierdo: avance y giro (se mantiene mientras se presiona)

| Dirección | Comando           | ID  | Código | Qué hace                         |
| --------- | ----------------- | --- | ------ | -------------------------------- |
| Arriba    | Avanzar           | 1   | 1      | Mueve el vehículo hacia adelante |
| Abajo     | Retroceder        | 2   | 2      | Mueve el vehículo hacia atrás    |
| Izquierda | Girar a Izquierda | 4   | 4      | Giro hacia la izquierda          |
| Derecha   | Girar a Derecha   | 3   | 3      | Giro hacia la derecha            |

### Joystick derecho: brazo y orugas (se mantiene mientras se presiona)

| Dirección | Comando            | ID  | Código | Qué hace                               |
| --------- | ------------------ | --- | ------ | -------------------------------------- |
| Arriba    | Subir Brazo        | 5   | 5      | Eleva el brazo                         |
| Abajo     | Bajar Brazo        | 6   | 6      | Desciende el brazo                     |
| Izquierda | Diagonal Izquierda | 12  | 10     | Gira con las orugas hacia la izquierda |
| Derecha   | Diagonal Derecha   | 13  | 11     | Gira con las orugas hacia la derecha   |

### Botones

| Botón        | Comando   | ID  | Código | Qué hace                                                                                            |
| ------------ | --------- | --- | ------ | --------------------------------------------------------------------------------------------------- |
| DETENER      | Detener   | 9   | 9      | Detiene cualquier movimiento. Si hay una DEMO en marcha, también la cancela                         |
| Luz          | Luz       | 17  | 15     | Enciende o apaga la luz. Inicia en **ON** y cambia a OFF/ON en pantalla al aceptarse cada orden     |
| Sonido       | Sonido    | 15  | 13     | Activa o silencia el sonido. Inicia en **ON** y cambia a OFF/ON en pantalla al aceptarse cada orden |
| Velocidad    | Velocidad | 14  | 12     | Cambia la velocidad                                                                                 |
| Demo carrito | Demo      | 16  | 14     | Ejecuta la demo integrada del control del carrito                                                   |

El estado ON/OFF de Luz y Sonido es el que se supone según las órdenes aceptadas por la API desde esta página;
no confirma el estado físico del vehículo.

### Selector DEMO

Lista las DEMO activas del vehículo (por ejemplo «Demo principal» y «Demo2»). **Ejecutar** inicia la elegida y
**Cancelar** detiene la que está en marcha. Mientras corre una DEMO no se aceptan movimientos manuales ni una segunda DEMO.
La página muestra el progreso con los eventos recibidos (`demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`).

### Reglas de operación

- Se envía una orden solo cuando **cambia la dirección** del joystick, nunca por cada movimiento.
- Al soltar el joystick, perder el gesto o volver al centro se solicita DETENER.
- Solo un control de movimiento puede estar activo a la vez; el segundo se ignora hasta soltar el primero.
- Teclado: con un joystick enfocado (Tab), las flechas lo mueven; Esc detiene.

## Estructura

```
control-iot/
├─ index.html           Página única (HTML semántico)
├─ README.md
└─ assets/
   ├─ css/styles.css    Estilos propios sobre Bootstrap 5
   ├─ img/favicon.svg   Favicon y logotipo
   └─ js/
      ├─ app.js         Arranque y conexión entre módulos
      ├─ config.js      URLs públicas y configuración
      ├─ api.js         Cliente REST (fetch, timeout, errores)
      ├─ errors.js      Errores y mensajes amigables
      ├─ state.js       Datos del vehículo, catálogo, estado de DEMO y de Luz/Sonido
      ├─ commands.js    Única vía de envío de comandos (prioridad de DETENER, sin duplicados)
      ├─ joystick.js    Joystick con Pointer Events y teclado
      ├─ demo.js        Iniciar y cancelar DEMO, eventos de DEMO
      ├─ websocket.js   Sesión WSS real y reconexión
      ├─ health.js      Comprobación periódica de /health (API y RDS)
      ├─ utils.js       Presentación de nombres (sin guiones bajos)
      └─ ui.js          Único módulo que modifica el DOM
```

## Requisitos

- Navegador moderno (Chrome, Edge, Firefox o Safari) con JavaScript activado.
- Para ejecutar en local: Python 3 (solo para el servidor de archivos estáticos).
- Los orígenes permitidos por CORS en el backend son `https://a-common-person.github.io` y `http://localhost:5500`.

## Ejecución local

Los módulos ES no funcionan abriendo el archivo con doble clic. Desde la carpeta del proyecto:

```
python -m http.server 5500
```

y abre `http://localhost:5500`. Si el navegador rechaza los módulos por tipo MIME (Windows), usa:

```
python -c "import http.server as h; h.SimpleHTTPRequestHandler.extensions_map['.js']='text/javascript'; h.test(HandlerClass=h.SimpleHTTPRequestHandler, port=5500)"
```

Si usas un bloqueador de anuncios (por ejemplo Brave Shields), desactívalo para el sitio: puede bloquear el WebSocket.

## Publicación en GitHub Pages

En el repositorio: Settings → Pages → «Deploy from a branch» → rama `main`, carpeta `/ (root)`.
Todas las rutas son relativas, por lo que funcionan en la subruta `/control-iot/`.

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

- La clave de operador (`X-API-Key`, necesaria para iniciar y cancelar DEMO) está en `assets/js/config.js` y se envía siempre; no aparece en la interfaz. Es una decisión del autor para una práctica personal: sigue siendo visible en el código y en las peticiones de red, y en un sistema real requeriría autenticación propia.
- Los datos remotos se insertan en el DOM solo con `textContent`.
- CORS en el backend limitado a los orígenes de la aplicación, a los métodos `GET` y `POST` y a las cabeceras `Content-Type` y `X-API-Key`.
