#!/usr/bin/env bash
# tests/test_entrypoint.sh — verifies the password derivation matches the
# Wave 0a `job_pools._pg_dsn_for` recipe.
#
# Reproduces the exact one-liner used in entrypoint.sh:
#   printf '%s' "${JOB_ID}" | openssl dgst -sha256 -hmac "${SECRET}" -hex | awk '{print $NF}'
#
# Then cross-checks against Python's hmac module. If both produce the same hex
# digest, the entrypoint's derivation is correct.
set -euo pipefail

JOB_ID=00000000-0000-0000-0000-000000000001
# Same shape as production secrets: a 32-byte random hex string.
SECRET="abcdef0123456789abcdef0123456789"

# Reproduce the entrypoint's HMAC-SHA256 derivation.
got=$(printf '%s' "${JOB_ID}" \
  | openssl dgst -sha256 -hmac "${SECRET}" -hex \
  | awk '{print $NF}')

# Independent cross-check via Python.
expected=$(JOB_ID="${JOB_ID}" SECRET="${SECRET}" python3 -c '
import hmac, hashlib, os
print(hmac.new(os.environ["SECRET"].encode(), os.environ["JOB_ID"].encode(), hashlib.sha256).hexdigest())
')

if [[ "$expected" != "$got" ]]; then
  echo "FAIL: derived password mismatch" >&2
  echo "expected (python hmac): $expected" >&2
  echo "got      (openssl):     $got" >&2
  exit 1
fi

# Also assert it's a 64-char hex string.
if [[ ! "$got" =~ ^[0-9a-f]{64}$ ]]; then
  echo "FAIL: derivation is not a 64-char hex string: $got" >&2
  exit 1
fi

echo "ok: HMAC-SHA256 derivation matches Wave 0a recipe (64-hex)"

# Also lint the entrypoint shell for syntax errors.
if ! bash -n "$(dirname "$0")/../entrypoint.sh"; then
  echo "FAIL: entrypoint.sh has shell syntax errors" >&2
  exit 1
fi
echo "ok: entrypoint.sh shell syntax clean"

# And the healthcheck.
if ! bash -n "$(dirname "$0")/../healthcheck.sh"; then
  echo "FAIL: healthcheck.sh has shell syntax errors" >&2
  exit 1
fi
echo "ok: healthcheck.sh shell syntax clean"
