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

./build.sh

SIZE_BYTES=$(docker image inspect job-pod:latest --format '{{.Size}}')
SIZE_GB=$(echo "scale=2; $SIZE_BYTES / 1024 / 1024 / 1024" | bc)
echo "image size: ${SIZE_GB} GB"
if (( $(echo "$SIZE_GB > 2.5" | bc -l) )); then
  echo "WARN: image > 2.5 GB target ceiling" >&2
fi
echo "ok: build clean"
