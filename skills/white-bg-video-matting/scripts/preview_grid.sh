#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <alpha-frames-dir> <output-grid.jpg> [fps]"
  exit 1
fi

ALPHA_FRAMES_DIR="$1"
OUTPUT_JPG="$2"
FPS="${3:-1}"

mkdir -p "$(dirname "${OUTPUT_JPG}")"

ffmpeg -y \
  -pattern_type glob \
  -framerate "${FPS}" \
  -i "${ALPHA_FRAMES_DIR}/*.png" \
  -vf "scale=240:-2,tile=3x4" \
  -frames:v 1 \
  "${OUTPUT_JPG}"
