#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

set -a
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  source "${SCRIPT_DIR}/.env"
elif [[ -f "${PROJECT_DIR}/.env.local" ]]; then
  source "${PROJECT_DIR}/.env.local"
  export MANGALENS_SERVER_URL="${MANGALENS_SERVER_URL:-http://localhost:3000}"
  export MANGALENS_WORKER_TOKEN="${MANGALENS_WORKER_TOKEN:-${LOCAL_OCR_WORKER_TOKEN:-}}"
  export MANGALENS_WORKER_ID="${MANGALENS_WORKER_ID:-local-mac}"
else
  echo "Missing local-worker/.env and project .env.local." >&2
  exit 1
fi
set +a

exec "${SCRIPT_DIR}/.venv/bin/python" "${SCRIPT_DIR}/worker.py"
