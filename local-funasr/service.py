#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

MAX_PCM_BYTES = 20 * 1024 * 1024


class RuntimeState:
    def __init__(self) -> None:
        self.state = "loading"
        self.status = "加载中"
        self.detail = "正在加载 Paraformer ONNX CPU 模型"
        self.model: Any = None
        self.model_load_seconds = None
        self.request_count = 0
        self.success_count = 0
        self.failure_count = 0
        self.lock = threading.Lock()

    def health(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "status": self.status,
            "detail": self.detail,
            "model_load_seconds": self.model_load_seconds,
            "request_count": self.request_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
        }


STATE = RuntimeState()


def load_model(model_dir: pathlib.Path) -> None:
    started = time.perf_counter()
    try:
        from funasr_onnx import Paraformer

        STATE.model = Paraformer(
            str(model_dir), batch_size=1, quantize=True,
            intra_op_num_threads=max(1, min(4, os.cpu_count() or 1)),
        )
        STATE.model_load_seconds = time.perf_counter() - started
        STATE.state = "ready"
        STATE.status = "已就绪"
        STATE.detail = "Paraformer 中文/英文 · ONNX INT8 · CPU"
    except Exception as error:
        STATE.model_load_seconds = time.perf_counter() - started
        STATE.state = "failed"
        STATE.status = "加载失败"
        STATE.detail = str(error)


def extract_text(result: Any) -> str:
    item = result[0] if isinstance(result, list) and result else result
    if isinstance(item, dict):
        value = item.get("preds", item.get("text", ""))
        if isinstance(value, list):
            value = value[0] if value else ""
        elif isinstance(value, tuple):
            value = value[0] if value else ""
        return str(value).strip()
    return str(item or "").strip()


def run_inference(model: Any, waveform: Any) -> str:
    return extract_text(model(waveform))


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalFunASR/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[LocalFunASR] {self.address_string()} {format % args}", flush=True)

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if urlparse(self.path).path != "/health":
            self.send_json(404, {"detail": "not found"})
            return
        self.send_json(200, STATE.health())

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/transcribe":
            self.send_json(404, {"detail": "not found"})
            return
        if STATE.state != "ready" or STATE.model is None:
            self.send_json(503, {"detail": STATE.detail})
            return
        try:
            query = parse_qs(parsed.query)
            sample_rate = int(query.get("sample_rate", ["16000"])[0])
            channels = int(query.get("channels", ["1"])[0])
            sample_width = int(query.get("sample_width", ["2"])[0])
            length = int(self.headers.get("Content-Length", "0"))
            if sample_rate != 16000 or channels != 1 or sample_width != 2:
                raise ValueError("expected mono 16 kHz signed 16-bit PCM")
            if length <= 0 or length > MAX_PCM_BYTES or length % 2:
                raise ValueError("invalid PCM payload size")
            pcm = self.rfile.read(length)
            if len(pcm) != length:
                raise ValueError("incomplete PCM payload")
        except ValueError as error:
            self.send_json(400, {"detail": str(error)})
            return

        import numpy as np

        waveform = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        started = time.perf_counter()
        STATE.request_count += 1
        try:
            with STATE.lock:
                text = run_inference(STATE.model, waveform)
            inference_seconds = time.perf_counter() - started
            STATE.success_count += 1
            self.send_json(200, {
                "text": text,
                "inference_seconds": inference_seconds,
                "total_seconds": inference_seconds,
            })
        except Exception as error:
            STATE.failure_count += 1
            self.send_json(500, {"detail": str(error)})


def self_test() -> None:
    assert extract_text([{"preds": ["测试成功"]}]) == "测试成功"
    assert extract_text({"text": " hello "}) == "hello"
    assert STATE.health()["state"] == "loading"
    print("self-test ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model-dir", type=pathlib.Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.host != "127.0.0.1":
        raise SystemExit("Local FunASR only binds to 127.0.0.1")
    if args.model_dir is None:
        raise SystemExit("--model-dir is required")
    threading.Thread(target=load_model, args=(args.model_dir,), daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[LocalFunASR] listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
