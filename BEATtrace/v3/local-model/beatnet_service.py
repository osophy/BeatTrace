"""Optional loopback-only BeatNet bridge for BeatTrace.

Install BeatNet and its prerequisites using the official upstream instructions,
then run: python local-model/beatnet_service.py
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from urllib.parse import unquote

HOST, PORT = "127.0.0.1", 8765
MAX_BYTES = 250 * 1024 * 1024
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
_model = None
_model_lock = threading.Lock()


def load_model():
    global _model
    if _model is None:
        from BeatNet.BeatNet import BeatNet
        _model = BeatNet(1, mode="offline", inference_model="DBN", plot=[], thread=False, device="cpu")
    return _model


class Handler(BaseHTTPRequestHandler):
    server_version = "BeatTraceLocalModel/1"

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        if origin not in ALLOWED_ORIGINS:
            self._json(403, {"error": "Origin not allowed"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Audio-Filename")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        if self.path != "/health":
            self._json(404, {"error": "Not found"})
            return
        try:
            package_version = version("BeatNet")
            load_model()
        except Exception:
            self._json(200, {"available": False})
            return
        self._json(200, {"available": True, "model": "BeatNet", "version": package_version})

    def do_POST(self):
        if self.path != "/analyze":
            self._json(404, {"error": "Not found"})
            return
        origin = self.headers.get("Origin", "")
        if origin not in ALLOWED_ORIGINS:
            self._json(403, {"error": "Origin not allowed"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size <= 0 or size > MAX_BYTES:
            self._json(413, {"error": "File must be between 1 byte and 250 MB"})
            return

        name = unquote(self.headers.get("X-Audio-Filename", "track.audio"))
        suffix = Path(name).suffix.lower()
        if not suffix or len(suffix) > 12 or not suffix[1:].isalnum():
            suffix = ".audio"
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix="beattrace-", suffix=suffix, delete=False) as temp:
                temp_path = temp.name
                remaining = size
                while remaining:
                    block = self.rfile.read(min(1024 * 1024, remaining))
                    if not block:
                        raise ValueError("Incomplete audio upload")
                    temp.write(block)
                    remaining -= len(block)
            with _model_lock:
                output = load_model().process(temp_path)
            beats = [{"time": float(row[0]), "beatPosition": int(round(float(row[1])))} for row in output]
            self._json(200, {"model": "BeatNet", "version": version("BeatNet"), "beats": beats})
        except Exception as exc:
            self._json(422, {"error": f"Local model could not analyze this file: {type(exc).__name__}"})
        finally:
            if temp_path:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

    def log_message(self, fmt, *args):
        print("BeatTrace local model:", fmt % args)


if __name__ == "__main__":
    try:
        load_model()
    except Exception as exc:
        raise SystemExit(f"BeatNet could not start ({type(exc).__name__}). Follow its official installation instructions.")
    print(f"BeatTrace local BeatNet service listening on http://{HOST}:{PORT}; audio stays on this computer.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
