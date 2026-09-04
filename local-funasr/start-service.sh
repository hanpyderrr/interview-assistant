#!/bin/zsh
set -euo pipefail

SERVICE_ROOT="${0:A:h}"
VENV_ROOT="$SERVICE_ROOT/.venv"
MODEL_ROOT="$SERVICE_ROOT/models/paraformer-zh"

if [[ ! -x "$VENV_ROOT/bin/python" ]]; then
  /usr/bin/python3 -m venv "$VENV_ROOT"
fi

if [[ ! -f "$VENV_ROOT/.dependencies-ready" || "$SERVICE_ROOT/requirements.txt" -nt "$VENV_ROOT/.dependencies-ready" ]]; then
  "$VENV_ROOT/bin/python" -m pip install --disable-pip-version-check -r "$SERVICE_ROOT/requirements.txt"
  touch "$VENV_ROOT/.dependencies-ready"
fi

"$VENV_ROOT/bin/python" "$SERVICE_ROOT/download_model.py" "$MODEL_ROOT"
exec "$VENV_ROOT/bin/python" "$SERVICE_ROOT/service.py" --model-dir "$MODEL_ROOT" "$@"
