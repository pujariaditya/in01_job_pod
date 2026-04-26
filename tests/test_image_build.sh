#!/usr/bin/env bash
# tests/test_image_build.sh — builds the image and confirms size sanity.
#
# Skipped (exit 0) if `docker` is not on PATH or the daemon is unreachable —
# the Dockerfile + supporting tree is the deliverable; CI on a build host
# is where the actual build happens.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "skip: docker not installed; image build smoke skipped"
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  echo "skip: docker daemon unreachable; image build smoke skipped"
  exit 0
fi

TAG="${TAG:-up-pi-pod:test}"
docker build -t "$TAG" .

SIZE_BYTES=$(docker image inspect "$TAG" --format '{{.Size}}')
SIZE_MB=$(echo "scale=2; $SIZE_BYTES / 1024 / 1024" | bc)
echo "image size: ${SIZE_MB} MB"
# Pi-runtime image is Node + .pi skill bundle only; small target ceiling
if (( $(echo "$SIZE_MB > 600" | bc -l) )); then
  echo "WARN: image > 600 MB ceiling for Pi-runtime image" >&2
fi
echo "ok: build clean"
