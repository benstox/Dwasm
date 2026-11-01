#!/usr/bin/env python3
"""Static stand-in for the Nextcloud app, for the browser smoke test.

Serves templates/index.php with its PHP stripped and an OCP.InitialState stub
injected, so the real launcher and the real engine artifacts run without a
Nextcloud instance. The engine route mirrors EngineController::FILES.
"""
import json
import mimetypes
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
ENGINE_FILES = {
    "index.js": "application/javascript",
    "index.wasm": "application/wasm",
    "index.data": "application/octet-stream",
    "freedoom1.wad.gz": "application/gzip",
    "freedoom2.wad.gz": "application/gzip",
}
INITIAL_STATE = {
    "launch": {
        "script": "/engine/index.js",
        "games": [
            {"id": "freedoom2", "label": "Freedoom: Phase 2", "url": "/engine/freedoom2.wad.gz"},
            {"id": "freedoom1", "label": "Freedoom: Phase 1", "url": "/engine/freedoom1.wad.gz"},
        ],
    }
}


def render_page() -> bytes:
    """The template's markup, with PHP tags reduced to their printed strings."""
    template = (APP / "templates" / "index.php").read_text()
    template = re.sub(r"p\(\$l->t\('([^']*)'\)\)", r"\1", template)
    body = re.sub(r"<\?php.*?\?>", "", template, flags=re.S)
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<title>Doom (Dwasm)</title>"
        "<link rel='stylesheet' href='/css/doom.css'>"
        "<script>window.__errors = [];window.__failed = [];"
        "window.addEventListener('error', e => window.__errors.push(String(e.message)));"
        "const origFetch = window.fetch;"
        "window.fetch = (...a) => origFetch(...a)"
        ".then(r => { if (!r.ok) window.__failed.push(r.status + ' ' + r.url); return r; });"
        "</script>"
        "<script>window.OCP = {InitialState: {loadState: (app, key) => ("
        + json.dumps(INITIAL_STATE)
        + ")[key]}};</script>"
        "<script src='/js/launcher.js' defer></script>"
        "</head><body>" + body + "</body></html>"
    ).encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/":
            return self.send(200, render_page(), "text/html")
        if path in ("/js/launcher.js", "/css/doom.css"):
            file = APP / path.lstrip("/")
            return self.send(200, file.read_bytes(), mimetypes.guess_type(str(file))[0])
        if path.startswith("/engine/"):
            name = path.removeprefix("/engine/")
            mime = ENGINE_FILES.get(name)
            file = APP / "engine" / name
            if mime is None or not file.is_file():
                return self.send(404, b"not found", "text/plain")
            return self.send(200, file.read_bytes(), mime)
        self.send(404, b"not found", "text/plain")

    def send(self, status: int, body: bytes, mime: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"serving on port {port}")
    ThreadingHTTPServer(("localhost", port), Handler).serve_forever()