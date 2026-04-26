#!/usr/bin/env bash
# Pod entrypoint:
#  1. Validate required env vars.
#  2. Derive per-pod PG / Dragonfly password from HMAC-SHA256(SECRET, JOB_ID)
#     (matches Wave 0a `job_pools._pg_dsn_for` recipe).
#  3. initdb PG on first boot; render pg_hba.conf + postgresql.conf.
#  4. Stage Dragonfly password, QuestDB conf, Redpanda conf.
#  5. exec /init (s6-overlay).
set -euo pipefail

echo "[entrypoint] starting pod for JOB_ID=${JOB_ID:?missing}" >&2

# --- 0. validate required env --------------------------------------------------
required_vars=(
  JOB_ID
  CUSTOMER_ID
  WALLET_ID
  UP_JOB_ROUTING_SECRET
  POLYMARKET_PROXY_WALLET
  POLYMARKET_PRIVATE_KEY
  POLYMARKET_API_KEY
)
for var in "${required_vars[@]}"; do
  if [[ -z "${!var-}" ]]; then
    echo "[entrypoint] FATAL: $var is required" >&2
    exit 10
  fi
done

# --- 1. derive per-pod creds via HMAC-SHA256 (matches Wave 0a recipe) ---------
# Note: openssl prints "(stdin)= <hex>" or "HMAC-SHA256(stdin)= <hex>" depending
# on version; the awk takes the last whitespace-separated field.
DERIVED_PASSWORD=$(printf '%s' "${JOB_ID}" \
  | openssl dgst -sha256 -hmac "${UP_JOB_ROUTING_SECRET}" -hex \
  | awk '{print $NF}')
export POD_PG_PASSWORD="${DERIVED_PASSWORD}"
export POD_DRAGONFLY_PASSWORD="${DERIVED_PASSWORD}"

PG_MAJOR="${PG_MAJOR:-17}"

# --- 2. PG initdb on first boot ------------------------------------------------
PG_DATA=/var/lib/postgresql/data
if [[ ! -s "${PG_DATA}/PG_VERSION" ]]; then
  echo "[entrypoint] initdb at ${PG_DATA}" >&2
  PWFILE=$(mktemp)
  printf '%s' "${DERIVED_PASSWORD}" > "${PWFILE}"
  chown postgres:postgres "${PWFILE}"
  chmod 0400 "${PWFILE}"

  su postgres -c "/usr/lib/postgresql/${PG_MAJOR}/bin/initdb \
    --pgdata=${PG_DATA} \
    --auth-local=trust --auth-host=md5 \
    --username=up_admin --pwfile=${PWFILE}"

  rm -f "${PWFILE}"

  cat >> "${PG_DATA}/postgresql.conf" <<EOF
listen_addresses = '*'
port = 5432
shared_buffers = 256MB
max_connections = 100
EOF
  cat > "${PG_DATA}/pg_hba.conf" <<EOF
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
host    all             all             0.0.0.0/0               md5
EOF
  chown postgres:postgres "${PG_DATA}/postgresql.conf" "${PG_DATA}/pg_hba.conf"
fi

# Generate the up_reader role + grants on every boot (idempotent).
mkdir -p /var/lib/postgresql/init.d
cat > /var/lib/postgresql/init.d/00-roles.sql <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='up_reader') THEN
    CREATE ROLE up_reader LOGIN PASSWORD '${DERIVED_PASSWORD}';
  ELSE
    ALTER ROLE up_reader WITH PASSWORD '${DERIVED_PASSWORD}';
  END IF;
END
\$\$;
EOF

# Schema (cribbed from unusual-predictions/db/postgres/init.sql).
if [[ -f /etc/pg-config/init.sql ]]; then
  cp /etc/pg-config/init.sql /var/lib/postgresql/init.d/01-schema.sql
fi

chown -R postgres:postgres /var/lib/postgresql/init.d

# --- 3. Dragonfly password --------------------------------------------------
export DRAGONFLY_REQUIREPASS="${DERIVED_PASSWORD}"
mkdir -p /var/run/dragonfly && chown -R jobpod:jobpod /var/run/dragonfly

# --- 4. QuestDB config ------------------------------------------------------
mkdir -p /var/lib/questdb/conf
if [[ -f /opt/questdb-config/server.conf ]]; then
  cp /opt/questdb-config/server.conf /var/lib/questdb/conf/server.conf
fi
chown -R jobpod:jobpod /var/lib/questdb

# --- 5. Redpanda single-node bootstrap --------------------------------------
mkdir -p /var/lib/redpanda /etc/redpanda
if [[ -f /etc/redpanda-config/redpanda.yaml ]]; then
  cp /etc/redpanda-config/redpanda.yaml /etc/redpanda/redpanda.yaml
fi
chown -R jobpod:jobpod /var/lib/redpanda /etc/redpanda

echo "[entrypoint] handing off to s6-overlay" >&2
exec "$@"
