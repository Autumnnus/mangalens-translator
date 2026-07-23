#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

"${PYTHON_BIN}" -m venv "${SCRIPT_DIR}/.venv"
"${SCRIPT_DIR}/.venv/bin/python" -m pip install --upgrade pip wheel
"${SCRIPT_DIR}/.venv/bin/python" -m pip install \
  paddlepaddle==3.3.0 \
  --index-url https://www.paddlepaddle.org.cn/packages/stable/cpu/
"${SCRIPT_DIR}/.venv/bin/python" -m pip install \
  -r "${SCRIPT_DIR}/requirements.txt"

echo "Local OCR dependencies installed. Copy .env.example to .env and run:"
echo "  bash local-worker/run-macos.sh"
