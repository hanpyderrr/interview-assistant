#!/usr/bin/env python3
import pathlib
import sys
import urllib.request

MODEL = "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-onnx"
FILES = {
    "am.mvn": 11203,
    "config.yaml": 2509,
    "configuration.json": 631,
    "model_quant.onnx": 238380216,
    "tokens.json": 93676,
}


def download(target: pathlib.Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    base = f"https://modelscope.cn/models/{MODEL}/resolve/master"
    for name, expected_size in FILES.items():
        destination = target / name
        if destination.exists() and destination.stat().st_size == expected_size:
            continue
        partial = destination.with_suffix(destination.suffix + ".part")
        print(f"[LocalFunASR] downloading {name}", flush=True)
        urllib.request.urlretrieve(f"{base}/{name}", partial)
        actual_size = partial.stat().st_size
        if actual_size != expected_size:
            partial.unlink(missing_ok=True)
            raise RuntimeError(f"{name} size mismatch: {actual_size} != {expected_size}")
        partial.replace(destination)


if __name__ == "__main__":
    root = pathlib.Path(sys.argv[1]).expanduser().resolve()
    download(root)
    print(f"[LocalFunASR] model ready: {root}", flush=True)
