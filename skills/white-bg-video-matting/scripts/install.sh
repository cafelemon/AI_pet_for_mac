#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Please install it first:"
  echo "  brew install ffmpeg"
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe not found. Please install it first:"
  echo "  brew install ffmpeg"
  exit 1
fi

cd "${SKILL_DIR}"
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo "Install complete."
echo "Activate with: source ${SKILL_DIR}/.venv/bin/activate"
