#!/usr/bin/with-contenv bash
# Wait for postgres to accept connections, then apply
# /var/lib/postgresql/init.d/*.sql once. Idempotent: marker file prevents re-apply.
set -e

if [[ -f /var/lib/postgresql/init.d/.applied ]]; then
  exit 0
fi

for i in $(seq 1 60); do
  if pg_isready -h 127.0.0.1 -p 5432 -t 1 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! pg_isready -h 127.0.0.1 -p 5432 -t 1 >/dev/null 2>&1; then
  echo "[pg-init] postgres did not come up within 60s" >&2
  exit 1
fi

for f in /var/lib/postgresql/init.d/*.sql; do
  [[ -f "$f" ]] || continue
  echo "[pg-init] applying $f" >&2
  PGPASSWORD="${POD_PG_PASSWORD}" psql -h 127.0.0.1 -U up_admin -d postgres -f "$f"
done

touch /var/lib/postgresql/init.d/.applied
