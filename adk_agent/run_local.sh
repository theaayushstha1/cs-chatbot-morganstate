#!/usr/bin/env bash
# Launch the CS Navigator ADK agent locally on port 8080.
# Env (project, model, Vertex routing) is read from adk_agent/.env by agent.py.
# Requires: gcloud ADC creds -> run once: gcloud auth application-default login
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "[ERROR] .venv not found. Create it with:"
  echo "  python3 -m venv .venv && .venv/bin/python -m pip install 'google-adk==1.23.0'"
  exit 1
fi

echo "[INFO] Starting ADK server at http://127.0.0.1:8080 ..."
exec .venv/bin/python -m google.adk.cli web . --port 8080 --host 127.0.0.1
