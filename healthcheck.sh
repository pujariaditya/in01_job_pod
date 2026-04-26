#!/usr/bin/env bash
# Confirms the 4 storage tiers are reachable inside the pod.
# Used by Docker HEALTHCHECK and by orchestrator polls.
set -e

failures=()

# PG
if ! pg_isready -h 127.0.0.1 -p 5432 -t 2 >/dev/null 2>&1; then
  failures+=(postgres)
fi

# Dragonfly
if ! redis-cli -h 127.0.0.1 -p 6379 -a "${POD_DRAGONFLY_PASSWORD-}" --no-auth-warning ping 2>/dev/null | grep -q PONG; then
  failures+=(dragonfly)
fi

# QuestDB
if ! curl -fsSL "http://127.0.0.1:9000/exec?query=SELECT+1" -m 2 >/dev/null 2>&1; then
  failures+=(questdb)
fi

# Redpanda
if ! curl -fsSL "http://127.0.0.1:9644/v1/status/ready" -m 2 >/dev/null 2>&1; then
  failures+=(redpanda)
fi

if [[ ${#failures[@]} -gt 0 ]]; then
  echo "DOWN: ${failures[*]}" >&2
  exit 1
fi
exit 0
