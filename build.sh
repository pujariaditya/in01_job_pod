#!/usr/bin/env bash
# Build the job-pod image. The build context is the *parent* directory of
# job_pod/ so the Dockerfile can reach unusual-predictions/ and job_engine/
# via COPY.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PARENT="$(cd "$HERE/.." && pwd)"

UP_SRC="${UP_SOURCE:-unusual-predictions}"
JE_SRC="${JOB_ENGINE_SOURCE:-job_engine}"
TAG="${TAG:-job-pod:latest}"

if [[ ! -d "$PARENT/$UP_SRC/app" ]]; then
  echo "ERROR: unusual-predictions source not at $PARENT/$UP_SRC/app." >&2
  echo "       Set UP_SOURCE relative to $PARENT." >&2
  exit 1
fi
if [[ ! -d "$PARENT/$JE_SRC/app" ]]; then
  echo "ERROR: job_engine source not at $PARENT/$JE_SRC/app." >&2
  echo "       Set JOB_ENGINE_SOURCE relative to $PARENT." >&2
  exit 1
fi

echo "Building $TAG ..."
echo "  build context: $PARENT"
echo "  UP_SOURCE:     $UP_SRC"
echo "  JE_SOURCE:     $JE_SRC"

docker build \
  --build-arg UP_SOURCE="$UP_SRC" \
  --build-arg JOB_ENGINE_SOURCE="$JE_SRC" \
  -t "$TAG" \
  -f "$HERE/Dockerfile" \
  "$PARENT"

echo "Built $TAG"
SIZE_BYTES=$(docker image inspect "$TAG" --format '{{.Size}}')
if command -v numfmt >/dev/null 2>&1; then
  printf '%s\n' "$SIZE_BYTES" | numfmt --to=iec
else
  awk -v b="$SIZE_BYTES" 'BEGIN { printf "%.2f GB\n", b/1024/1024/1024 }'
fi
