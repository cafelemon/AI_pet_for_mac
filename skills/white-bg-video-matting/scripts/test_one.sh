#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <input-video> <output-webm> [height] [fps] [crf]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
INPUT_VIDEO="$1"
OUTPUT_WEBM="$2"
HEIGHT="${3:-768}"
FPS="${4:-24}"
CRF="${5:-22}"

cd "${SKILL_DIR}"
. .venv/bin/activate

python matting_video.py \
  --input "${INPUT_VIDEO}" \
  --output "${OUTPUT_WEBM}" \
  --height "${HEIGHT}" \
  --fps "${FPS}" \
  --crf "${CRF}" \
  --alpha-expand 3 \
  --alpha-blur 0.6 \
  --erode-size 5 \
  --make-preview true
