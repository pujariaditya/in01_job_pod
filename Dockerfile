# syntax=docker/dockerfile:1.7
#
# job-pod — all-in-one image: PG-17 + Dragonfly + QuestDB + Redpanda
#                           + UP's 5 ingest processes
#                           + job_engine startup/cycle binaries
#                           + s6-overlay 3.x
#
# Build context: parent dir of job_pod/ (so we can COPY ../unusual-predictions
# and ../job_engine directly). See build.sh.

# ============================================================================
# Stage 1 — job_engine TypeScript build (Node 22)
# ============================================================================
FROM node:22-alpine AS je-builder

ARG JOB_ENGINE_SOURCE=job_engine

WORKDIR /build

COPY ${JOB_ENGINE_SOURCE}/package.json ${JOB_ENGINE_SOURCE}/package-lock.json ./
COPY ${JOB_ENGINE_SOURCE}/tsconfig.json ${JOB_ENGINE_SOURCE}/tsconfig.build.json ./
RUN npm ci --include=dev

COPY ${JOB_ENGINE_SOURCE}/app ./app
RUN npx tsc -p tsconfig.build.json && \
    npm prune --omit=dev

# ============================================================================
# Stage 1b — UP Python venv build (Python 3.13, matches UP's own Dockerfile)
# ============================================================================
FROM python:3.13-slim AS up-builder

ARG UP_SOURCE=unusual-predictions

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip

WORKDIR /srv
# CLAUDE.md is the pyproject's readme; the outer .dockerignore strips *.md so
# we synthesize a stub here unconditionally — only metadata is read.
COPY ${UP_SOURCE}/pyproject.toml ./pyproject.toml
COPY ${UP_SOURCE}/app ./app
RUN echo "# unusual-predictions (stub readme for hatchling)" > CLAUDE.md && \
    /opt/venv/bin/pip install --no-cache-dir .

# ============================================================================
# Stage 2 — runtime base (debian + s6 + 4 storage runtimes + Python + Node)
# ============================================================================
FROM debian:bookworm-slim

ARG UP_SOURCE=unusual-predictions
ARG JOB_ENGINE_SOURCE=job_engine
ARG S6_OVERLAY_VERSION=3.2.0.0

ENV DEBIAN_FRONTEND=noninteractive \
    PG_MAJOR=17 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:${PATH}" \
    NODE_ENV=production \
    QUESTDB_VERSION=8.2.0

# --- system deps + apt repos -------------------------------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates curl wget gnupg lsb-release \
        xz-utils python3 python3-pip python3-venv \
        netcat-openbsd procps redis-tools openssl bc && \
    rm -rf /var/lib/apt/lists/*

# Eclipse Temurin JDK 21 (Debian bookworm ships JDK 17 only).
RUN curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | \
        gpg --dearmor -o /usr/share/keyrings/adoptium.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" \
        > /etc/apt/sources.list.d/adoptium.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends temurin-21-jre && \
    rm -rf /var/lib/apt/lists/*

# Postgres 17 from PGDG
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
        gpg --dearmor -o /usr/share/keyrings/pgdg.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends postgresql-${PG_MAJOR} && \
    rm -rf /var/lib/apt/lists/*

# Node 22 (NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Dragonfly (.deb from GitHub release). Pulls in zstd + libssl3 from main repo.
RUN ARCH=$(uname -m) && \
    case "$ARCH" in \
      x86_64)  DEB_ARCH=amd64 ;; \
      aarch64) DEB_ARCH=arm64 ;; \
      *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/dragonflydb/dragonfly/releases/latest/download/dragonfly_${DEB_ARCH}.deb" \
        -o /tmp/dragonfly.deb && \
    apt-get update && \
    apt-get install -y --no-install-recommends /tmp/dragonfly.deb && \
    rm -f /tmp/dragonfly.deb && \
    rm -rf /var/lib/apt/lists/*

# QuestDB (no-jre flavor; we use the system JDK 21)
RUN curl -fsSL "https://github.com/questdb/questdb/releases/download/${QUESTDB_VERSION}/questdb-${QUESTDB_VERSION}-no-jre-bin.tar.gz" \
        -o /tmp/questdb.tgz && \
    mkdir -p /opt/questdb && \
    tar -xzf /tmp/questdb.tgz -C /opt/questdb --strip-components=1 && \
    rm -f /tmp/questdb.tgz

# Redpanda (apt repo)
# The redpanda.com hosted setup script handles keyring + sources.list.d wiring.
RUN curl -fsSL https://dl.redpanda.com/nzc4ZYQK3WRGd9sy/redpanda/cfg/setup/bash.deb.sh | bash && \
    apt-get install -y --no-install-recommends redpanda && \
    rm -rf /var/lib/apt/lists/*

# s6-overlay 3.x
RUN ARCH=$(uname -m) && \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" \
        -o /tmp/s6-noarch.tar.xz && \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${ARCH}.tar.xz" \
        -o /tmp/s6-arch.tar.xz && \
    tar -xJf /tmp/s6-noarch.tar.xz -C / && \
    tar -xJf /tmp/s6-arch.tar.xz -C / && \
    rm -f /tmp/s6-noarch.tar.xz /tmp/s6-arch.tar.xz

# --- Python 3.13 + UP venv -------------------------------------------------
# Bookworm only ships Python 3.11; UP's pyproject requires >=3.13. So we copy
# the full Python install + venv from the up-builder stage (python:3.13-slim).
COPY --from=up-builder /usr/local/bin/python3.13 /usr/local/bin/python3.13
COPY --from=up-builder /usr/local/bin/python3 /usr/local/bin/python3
COPY --from=up-builder /usr/local/lib/python3.13 /usr/local/lib/python3.13
COPY --from=up-builder /usr/local/lib/libpython3.13.so.1.0 /usr/local/lib/libpython3.13.so.1.0
COPY --from=up-builder /usr/local/include/python3.13 /usr/local/include/python3.13
COPY --from=up-builder /opt/venv /opt/venv
COPY ${UP_SOURCE}/app /opt/up/app
ENV LD_LIBRARY_PATH=/usr/local/lib
# Provide bare `python` so the venv's symlink (`/opt/venv/bin/python -> /usr/local/bin/python`)
# resolves; also fix Java exec bit (Temurin tarball loses +x on COPY in some flavors).
RUN ldconfig && \
    ln -sf /usr/local/bin/python3.13 /usr/local/bin/python && \
    chmod +x /usr/lib/jvm/temurin-21-jre/bin/java || true

# --- Node + job_engine compiled output --------------------------------------
COPY --from=je-builder /build/dist /opt/job_engine/dist
COPY --from=je-builder /build/node_modules /opt/job_engine/node_modules
COPY --from=je-builder /build/package.json /opt/job_engine/package.json
# Skills .md catalog — read at orchestrator startup. Built from source, not the
# je-builder stage (skills/ isn't part of the TS compile).
COPY ${JOB_ENGINE_SOURCE}/skills /opt/job_engine/skills

# --- Entrypoint, healthcheck, s6 service tree, config templates -------------
COPY job_pod/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY job_pod/healthcheck.sh /usr/local/bin/healthcheck.sh
COPY job_pod/s6 /etc/s6-overlay
COPY job_pod/pg /etc/pg-config
COPY job_pod/questdb /opt/questdb-config
COPY job_pod/redpanda /etc/redpanda-config

RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck.sh && \
    find /etc/s6-overlay -type f \( -name "run" -o -name "up" -o -name "check" -o -name "*.sh" \) \
         -exec chmod +x {} \; && \
    # s6-overlay 3.x ships `with-contenv` at /command/with-contenv, but the run
    # scripts use the legacy `#!/usr/bin/with-contenv bash` shebang. Provide a
    # compatibility symlink so kernel exec finds the interpreter.
    ln -sf /command/with-contenv /usr/bin/with-contenv

# --- Runtime users + dirs ---------------------------------------------------
# postgres user is created by the postgresql-17 package.
# Other services run as the unprivileged `jobpod` user in single-tenant mode.
RUN useradd -r -m -s /bin/false jobpod && \
    install -d -m 0755 -o postgres -g postgres /var/lib/postgresql/data && \
    install -d -m 0755 -o postgres -g postgres /var/lib/postgresql/init.d && \
    install -d -m 0755 -o postgres -g postgres /var/run/postgresql && \
    install -d -m 0755 -o jobpod -g jobpod /var/run/dragonfly && \
    install -d -m 0755 -o jobpod -g jobpod /var/lib/questdb && \
    install -d -m 0755 -o jobpod -g jobpod /var/lib/redpanda

# --- Entry ------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD /usr/local/bin/healthcheck.sh

ENV S6_KEEP_ENV=1 \
    S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
    S6_VERBOSITY=1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/init"]
