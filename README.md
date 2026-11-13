# Control IoT

Aplicación web de **CONTROL** y **MONITOREO** para un vehículo IoT (Excavadora IoT). Es un frontend estático
(HTML5, CSS3, Bootstrap 5 y JavaScript con módulos nativos) publicado en GitHub Pages. Envía las órdenes
a la API FastAPI desplegada en AWS (REST por HTTPS) y mantiene una sesión WebSocket (WSS) para recibir
los eventos que publica el backend.

- Página publicada: https://a-common-person.github.io/control-iot/
- API (Swagger): https://vehiculo-iot-erik.duckdns.org/docs

Son dos de las tres aplicaciones del proyecto (Control, Monitoreo y Administración), en una sola página con navegación
entre vistas. No incluye administración ni acceso directo a la base de datos, y no se conecta al microcontrolador.

## Qué hace

- **Mueve el vehículo** con dos joysticks virtuales (táctiles o con mouse) y con botones.
- **Detiene el vehículo** con prioridad sobre cualquier otra acción (botón DETENER o tecla Esc).
- **Ejecuta y cancela DEMO** que ya existen en la API. El orden, la duración y la pausa los respeta el backend.
- **Monitorea en tiempo real** el último movimiento y los 10 movimientos individuales más recientes (vista Monitoreo).
- **Muestra tres indicadores independientes** de conexión: WebSocket, API AWS y Amazon RDS, visibles en las dos vistas.
- **Muestra cada acción** como «Solicitado», «Aceptado por la API» y «evento recibido», sin afirmar nunca que el vehículo se movió.
- **Pantalla completa:** el botón junto al nombre del vehículo activa y quita la pantalla completa (oculta la barra del navegador). En Safari de iPhone el navegador no lo permite y el botón se oculta; allí sirve «Compartir → Añadir a pantalla de inicio».
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
├─ index.html           Página única con las vistas Control y Monitoreo
├─ README.md
└─ assets/
   ├─ css/styles.css    Estilos propios sobre Bootstrap 5
   ├─ img/favicon.svg   Favicon y logotipo
   └─ js/
      ├─ app.js          Arranque y conexión entre módulos (una sola sesión WSS compartida)
      ├─ config.js       URLs públicas y configuración (incluida la zona horaria)
      ├─ router.js       Navegación Control / Monitoreo por hash (#control, #monitoreo)
      ├─ fullscreen.js   Botón de pantalla completa (entrar y salir)
      ├─ api.js          Cliente REST único (fetch, timeout, errores)
      ├─ errors.js       Errores y mensajes amigables
      ├─ state.js        Datos del vehículo, catálogo, estado de DEMO y de Luz/Sonido
      ├─ websocket.js    Sesión WSS real y reconexión
      ├─ health.js       Comprobación periódica de /health (API y RDS)
      ├─ commands.js     CONTROL: única vía de envío de comandos (prioridad de DETENER)
      ├─ joystick.js     CONTROL: joystick con Pointer Events y teclado
      ├─ demo.js         CONTROL: iniciar y cancelar DEMO
      ├─ monitor.js      MONITOREO: carga inicial, eventos en vivo y sincronización
      ├─ monitor-view.js MONITOREO: tarjeta y tabla (único código que toca su DOM)
      ├─ utils.js        Nombres legibles y formato de fecha y hora
      └─ ui.js           CONTROL e indicadores: único módulo que modifica su DOM
```

## Monitoreo (actividad 4.2)

La vista **Monitoreo** amplía Control sin reemplazarlo: comparte cabecera, indicadores, conexión WebSocket, cliente REST
y diseño. Se abre desde las pestañas «Control» y «Monitoreo» (`#control` y `#monitoreo`).

- **Último movimiento:** tarjeta con el nombre, la fecha, la hora, el código y el origen, solo si la API o el evento los traen.
  Muestra «Cargando…», «Sin movimientos» o «Sin datos actualizados» (último valor conocido) según el caso.
  Es el último movimiento _reportado_; no confirma ejecución física.
- **Tabla de 10 movimientos:** los movimientos individuales más recientes guardados en Amazon RDS, del más nuevo al más antiguo,
  con `#`, Movimiento, Fecha y Hora (y Código e ID en pantallas anchas). El número de fila es solo visual. Los pasos de una DEMO
  no se guardan en el historial, así que no aparecen.
- **Línea de DEMO:** indica inicio, fin o cancelación de una DEMO con los eventos recibidos.

### Contratos usados (reales, del `openapi.json`)

| Uso                    | Método y ruta                    | Datos que se usan                                                                                    |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Último estado guardado | `GET /vehiculos/{id}/estado`     | `vehiculo`, `comando`, `codigo`, `fecha_actualizacion` (puede ser `null`)                            |
| Historial individual   | `GET /vehiculos/{id}/historial`  | máximo 10, del más nuevo al más antiguo: `id_historial`, `comando`, `codigo`, `fecha_hora`, `origen` |
| Eventos en vivo        | `wss://<host>/ws/vehiculos/{id}` | `movimiento`, `demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`, `estado_actual`        |

### Cómo se mantiene actualizado

1. **Carga inicial (REST):** al abrir Monitoreo se consultan el último estado y el historial.
2. **Evento `movimiento` (WSS):** actualiza la tarjeta al instante y dispara una resincronización del historial por REST.
   No hay polling. Si el registro persistido aún no aparece, se reintenta dos veces de forma acotada.
3. **Pasos de DEMO (`demo_movimiento`):** actualizan solo la tarjeta; no se consulta ni se modifica el historial.
4. **`estado_actual`:** su marca de tiempo es la de la conexión, no la del movimiento, así que no se muestra; se consulta el estado real por REST.
5. **Reconexión del WSS o volver a Monitoreo:** se vuelve a consultar el estado y el historial para recuperar lo perdido.
6. **Orden, duplicados y respuestas atrasadas:**
   - Se ignoran los eventos de otro vehículo, los duplicados exactos y los eventos más viejos que el último aplicado.
   - Una respuesta REST nunca sustituye a un evento que llegó después de pedirla.
   - La tabla se reconstruye desde la respuesta confirmada, sin duplicados por `id_historial`, y se limita a 10 filas.

### Fecha y hora

Los eventos traen la hora en UTC (`+00:00`). `fecha_hora` y `fecha_actualizacion` de la base llegan sin zona y se interpretan
según `DB_NAIVE_TIME_ZONE` en `assets/js/config.js` (por defecto `UTC`). Todo se muestra en `DISPLAY_TIME_ZONE`
(`America/Mexico_City`). Si las horas de la tabla no coinciden con las de la tarjeta para el mismo movimiento, cambia `DB_NAIVE_TIME_ZONE` a `'local'`.

### Cómo comprobarlo

1. **Carga inicial:** abre `#monitoreo`; deben verse el último estado y hasta 10 filas con fecha y hora.
2. **En vivo desde Control:** envía Avanzar, Girar a Derecha y Detener; la tarjeta cambia al instante y la tabla se actualiza sin recargar.
3. **Origen externo:** con Monitoreo abierto, envía un movimiento desde otra pestaña, Postmate o Swagger (`POST /vehiculos/1/movimientos`).
4. **Más de 10:** genera más de 10 movimientos; la tabla muestra exactamente los 10 más recientes, sin repetidos.
5. **Reconexión:** corta y restablece la red (o `nssm stop/start` en el servidor); el WebSocket pasa a «Reconectando…», la tarjeta indica «Sin datos actualizados» y, al volver, se consulta de nuevo.
6. **DEMO:** ejecuta una DEMO; la tarjeta muestra cada paso y la tabla no cambia.

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
