# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS builder

WORKDIR /agent
COPY agent/package.json agent/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY agent/tsconfig.json agent/tsconfig.test.json ./
COPY agent/src ./src
RUN npm install --no-audit --no-fund && npx tsc

FROM node:22-bookworm-slim
WORKDIR /agent

COPY --from=builder /agent/node_modules ./node_modules
COPY --from=builder /agent/dist ./dist
COPY agent/package.json ./
COPY .pi /agent/.pi

ENV NODE_ENV=production \
    UP_DAEMON_SOCK=/var/lib/pi/up-daemon.sock \
    UP_SESSION_DIR=/var/lib/pi/sessions

VOLUME /var/lib/pi
HEALTHCHECK --interval=15s --timeout=2s --start-period=10s --retries=3 \
    CMD test -S "${UP_DAEMON_SOCK}" || exit 1

ENTRYPOINT ["node", "dist/main.js"]
