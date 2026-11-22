from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        destino = Path(self.translate_path(self.path)).resolve()
        raiz = Path(self.directory).resolve()
        activo = destino.is_file() and destino.is_relative_to(raiz / "assets")
        if destino not in (raiz, raiz / "index.html") and not activo:
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        # La vista local debe cargar la misma versión del HTML y los módulos.
        del self.headers["If-Modified-Since"]
        return super().send_head()


if __name__ == "__main__":
    handler = partial(FrontendHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", 5500), handler) as servidor:
        print("Administración IoT: http://127.0.0.1:5500/?modo=administracion")
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            pass
