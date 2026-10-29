"""Loopback-only Demucs stem separation service for BeatTrace.

Install the optional Demucs dependency in an isolated Python environment, then run:
  python local-model/separation_service.py
Audio is processed locally. Model weights are downloaded by Demucs when first used.
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

HOST, PORT = "127.0.0.1", 8767
MAX_BYTES = 250 * 1024 * 1024
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
ROOT = Path(tempfile.gettempdir()) / "beattrace-demucs"
ROOT.mkdir(parents=True, exist_ok=True)
_lock = threading.Lock()
_separator = None
_backend = None
STEMS = ("vocals", "drums", "bass", "other")


def cleanup_old_runs():
    cutoff = time.time() - 6 * 60 * 60
    for entry in ROOT.iterdir():
        try:
            if entry.stat().st_mtime < cutoff:
                shutil.rmtree(entry, ignore_errors=True) if entry.is_dir() else entry.unlink(missing_ok=True)
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    server_version = "BeatTraceLocalSeparation/1"

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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Audio-Filename")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            try:
                import demucs_mlx  # noqa: F401
                self._json(200, {"available": True, "model": "htdemucs", "backend": "demucs-mlx", "device": "Apple MLX"})
            except Exception:
                try:
                    import demucs  # noqa: F401
                    import torch
                    device = "mps" if torch.backends.mps.is_available() else "cpu"
                    self._json(200, {"available": True, "model": "htdemucs", "backend": "demucs", "device": device})
                except Exception:
                    self._json(200, {"available": False, "model": "htdemucs"})
            return

        parts = self.path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "stems" or parts[2] not in {f"{stem}.wav" for stem in STEMS}:
            self._json(404, {"error": "Not found"})
            return
        run_id, filename = parts[1], parts[2]
        if not run_id.isalnum():
            self._json(404, {"error": "Not found"})
            return
        origin = self.headers.get("Origin", "")
        if origin not in ALLOWED_ORIGINS:
            self._json(403, {"error": "Origin not allowed"})
            return
        target = ROOT / run_id / filename
        if not target.is_file():
            self._json(404, {"error": "Stem not found"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(target.stat().st_size))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        with target.open("rb") as stream:
            shutil.copyfileobj(stream, self.wfile)

    def do_DELETE(self):
        run_id = self.path.removeprefix("/stems/").strip("/")
        if not run_id.isalnum():
            self._json(404, {"error": "Not found"})
            return
        shutil.rmtree(ROOT / run_id, ignore_errors=True)
        self._json(200, {"deleted": True})

    def do_POST(self):
        if self.path != "/separate":
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
            self._json(413, {"error": "Audio must be between 1 byte and 250 MB"})
            return

        run_id = uuid.uuid4().hex
        run_dir = ROOT / run_id
        run_dir.mkdir()
        safe_name = Path(unquote(self.headers.get("X-Audio-Filename", "audio.mp3"))).name
        extension = Path(safe_name).suffix.lower()
        if extension not in {".aac", ".mp3", ".wav", ".m4a", ".flac", ".ogg", ".mp4"}:
            extension = ".audio"
        source = run_dir / f"input{extension}"
        try:
            with source.open("wb") as stream:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError("Upload ended before all audio bytes arrived")
                    stream.write(chunk)
                    remaining -= len(chunk)
            with _lock:
                cleanup_old_runs()
                separate_to_wavs(source, run_dir)
                from drum_analysis import analyze_drum_stem
                drum_events = analyze_drum_stem(run_dir / "drums.wav")
            source.unlink(missing_ok=True)
            self._json(200, {"runId": run_id, "modelId": "htdemucs", "device": _backend, "stems": list(STEMS), "drumEvents": drum_events})
        except Exception as failure:
            shutil.rmtree(run_dir, ignore_errors=True)
            message = str(failure)
            if "No module named" in message or "Demucs" in message or "demucs" in message:
                message = "Demucs MLX is not installed in this Python environment. See the local model setup in README.md."
            self._json(500, {"error": message})

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")


def separate_to_wavs(source: Path, output_dir: Path):
    global _separator, _backend
    try:
        from demucs_mlx import Separator
        import numpy as np
        import wave
        if _separator is None:
            _separator = Separator(model="htdemucs")
        _backend = "Apple MLX"
        _, separated = _separator.separate_audio_file(str(source))
        for stem in STEMS:
            samples = np.asarray(separated[stem], dtype=np.float32)
            if samples.ndim == 1:
                samples = samples[:, None]
            elif samples.ndim != 2:
                raise RuntimeError(f"Unexpected {stem} audio shape: {samples.shape}")
            if samples.shape[0] <= 8:
                samples = samples.T
            samples = np.clip(samples, -1, 1)
            pcm = (samples * 32767).astype("<i2")
            with wave.open(str(output_dir / f"{stem}.wav"), "wb") as stream:
                stream.setnchannels(pcm.shape[1])
                stream.setsampwidth(2)
                stream.setframerate(44100)
                stream.writeframes(pcm.tobytes())
        return
    except ModuleNotFoundError as error:
        if error.name != "demucs_mlx":
            raise

    import demucs.separate
    import torch
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    _backend = f"Demucs {device}"
    demucs.separate.main(["-n", "htdemucs", "--device", device, "-o", str(output_dir), str(source)])
    candidates = list(output_dir.glob("htdemucs/*"))
    if not candidates:
        raise RuntimeError("Demucs completed without producing stem files")
    for stem in STEMS:
        produced = candidates[0] / f"{stem}.wav"
        if not produced.is_file():
            raise RuntimeError(f"Demucs did not produce the {stem} stem")
        shutil.copyfile(produced, output_dir.parent / f"{stem}.wav")
    shutil.rmtree(output_dir, ignore_errors=True)


if __name__ == "__main__":
    print(f"BeatTrace local source separation listening on http://{HOST}:{PORT}")
    print("Audio files are processed locally; model weights may be downloaded on first use.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
