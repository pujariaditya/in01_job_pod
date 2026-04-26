# job_pod — All-in-One Docker Image

Per spec §4.1: bundles PG-17 + Dragonfly + QuestDB + Redpanda + UP's 5 ingest
processes + the job_engine Node binaries (`startup` + `cycle`), supervised by
s6-overlay 3.2.0.0. customer_backend's `spawn_job_pod` (Wave 6) launches one of
these per `(customer_id, market_id, wallet_id)` job.

## Build

The build context expects two sibling source trees:

```
in01/
├── unusual-predictions/    (UP_SOURCE)
├── job_engine/             (JOB_ENGINE_SOURCE)
└── job_pod/                (this repo)
```

```bash
./build.sh
# or
docker build \
  --build-arg UP_SOURCE=../unusual-predictions \
  --build-arg JOB_ENGINE_SOURCE=../job_engine \
  -t job-pod:latest \
  -f Dockerfile \
  ..
```

`build.sh` invokes `docker build` with the parent dir as the build context so
the Dockerfile can `COPY ../unusual-predictions/...` and `COPY ../job_engine/...`.

## Run (smoke)

The pod is normally launched by
`customer_backend.infra.docker_orchestrator.spawn_job_pod` with all 21 env vars
(per spec §4.2). For local smoke without customer_backend, see
`tests/test_image_build.sh`.

## Supervised services (12 total)

| s6-rc unit         | Type    | Depends on                                      |
|--------------------|---------|-------------------------------------------------|
| postgres           | longrun | —                                               |
| pg-init            | oneshot | postgres                                        |
| dragonfly          | longrun | —                                               |
| questdb            | longrun | —                                               |
| redpanda           | longrun | —                                               |
| ingest-feed        | longrun | postgres, dragonfly, redpanda, pg-init          |
| ingest-writer      | longrun | postgres, dragonfly, questdb, redpanda, pg-init |
| ingest-backfill    | longrun | postgres, dragonfly, redpanda, pg-init          |
| ingest-control     | longrun | postgres, dragonfly, redpanda, pg-init          |
| ingest-analytics   | longrun | postgres, dragonfly, questdb, redpanda, pg-init |
| job-engine-startup | oneshot | all storage + all 5 ingest                      |
| job-engine-cycle   | longrun | job-engine-startup                              |

## Healthcheck

`docker exec <pod> /usr/local/bin/healthcheck.sh` confirms PG accepts
connections, Dragonfly responds to `PING`, QuestDB `/exec` returns 2xx, and
Redpanda admin `/v1/status/ready` is up.

## Per-pod credentials

Each pod derives its own PG and Dragonfly password via:

```
DERIVED_PASSWORD = HMAC-SHA256(UP_JOB_ROUTING_SECRET, JOB_ID).hexdigest()
```

(Same recipe as Wave 0a `job_pools._pg_dsn_for`.)

So two pods with different `JOB_ID`s never share a password, even though the
secret material (`UP_JOB_ROUTING_SECRET`) is identical.

## Deploy

1. Build on the build host: `./build.sh`
2. Push to your registry: `docker tag job-pod:latest registry/job-pod:<sha>`
3. Set `JOB_POD_IMAGE=registry/job-pod:<sha>` in customer_backend's env.
4. customer_backend's `spawn_job_pod` will use this image for every per-job pod.

## Operational notes

- Pod RAM default: 3 GB. Reaper bumps by 50% per crash up to 5 restarts.
- Pod is ephemeral (`--rm`); customer_db.trades is the durable record.
- s6-overlay supervises 12 units (4 storage + pg-init + 5 ingest +
  job-engine-startup + job-engine-cycle).
- HEALTHCHECK pings the 4 storage ports. Pod-engine status is in
  `customer_db.jobs.state`.
- Image size target: ≤ 2.5 GB. Largest contributors: JDK 21 (~500 MB),
  Redpanda (~600 MB), node + UP venv (~250 MB), debian base (~100 MB).

## Pi runtime (Wave C — added 2026-04-26)

`job_pod/agent/` is the Pi-coding-agent runtime that boots inside customer
pods. TypeScript, Node 22, vitest. Builds via Dockerfile.pi → `up-pi-pod`.

### Key components

- `agent/src/main.ts` — SDK-mode entrypoint with cron loop + idle-skip gate
  (per spec §5.5: fingerprint TOB+trade-counts, skip turn if unchanged within
  noise threshold AND time-since-last < max_idle_minutes; force-run on
  cold-start, max-idle-elapsed, or snapshot failure).
- `agent/src/daemon-client.ts` — async UDS client mirroring the Python one
  in unusual-predictions/app/daemon/up_daemon_client.py.
- `agent/src/schema-convert.ts` — JSON Schema → typebox converter for
  Pydantic-emitted manifests.
- `agent/src/extensions/up-tools.ts` — auto-registers all 77 daemon
  handlers from `_manifest` at boot.
- `agent/src/extensions/up-mcp-polypi.ts` — wraps polypi MCP tools
  (the only remote MCP per spec §3) as Pi tools.
- `.pi/skills/strategies/` — 17 strategy markdowns (synced from job_engine
  via scripts/lint-skills-sync.sh until Wave F deletes job_engine).
- `.pi/AGENTS.md` — global pod baseline (BUY/SELL/HOLD enum, stage
  allowlists, hard rules).
- `scripts/parity_compare.py` — Wave E cutover gate utility (≥99%
  agreement across 48h).

### Important Wave C → Wave D handoff

The Pi 0.70.2 SDK API is materially different from the spec's pseudocode:
real shape is `createAgentSession()` + `session.prompt(text)` +
`session.subscribe()`, not `createCodingAgent()` + `agent.runTurn()`. The
`createPiAgent` adapter in `agent/src/main.ts` is currently stubbed; Wave D
must replace it with the real Pi SDK call before lifecycle extensions can
be exercised end-to-end.

### Build + run

```bash
cd job_pod/agent
npm install
npx vitest run               # 28 tests pass
npx tsc --noEmit -p tsconfig.test.json
```

```bash
docker build -f Dockerfile.pi -t up-pi-pod:wave-c .
docker images up-pi-pod:wave-c   # ~132 MB compressed / ~679 MB on-disk arm64
```

## Pi runtime extensions (Wave D — added 2026-04-26)

Three lifecycle extensions installed alongside up-tools and up-mcp-polypi:

- `up-stage` — hard sequencer enforcing 5-stage allowlists (Sense → Frame →
  Score → Decide → Critique → Commit). 3 violations end the cycle.
  Critique → Commit gated on `lastDecision ∈ {BUY, SELL}`; HOLD ends the
  cycle.
- `up-memory` — 4 hooks: before_agent_start (loads top-10 skill posteriors +
  open positions into the system prompt), tool_call (logs skill invocations
  to agent_skills_log + validates BUY/SELL/HOLD on agent_findings_write +
  captures lastDecision), context (injects fresh TOB snapshot ephemerally),
  session_before_compact (preserves trade entries verbatim).
- `up-killswitch` — polls Dragonfly `killswitch:<job_id>` flag; on set, aborts
  in-flight tool + writes KILL_SWITCH_TRIPPED lifecycle event.

main.ts now uses real Pi 0.70.2 (`createAgentSession` +
`DefaultResourceLoader.extensionFactories`); a `createPiLikeAdapter` in
`main.ts` translates Pi 0.70's `(event, ctx)` shapes to the structural
`PiLike` contract the extensions expect. Extensions are unchanged from
their Wave D commits.

Two known follow-ups for Wave E:
- Watchdog timeout doesn't yet call `session.abort()` — it only races the
  promise, so the in-flight prompt continues. Cron tick risk: minimal under
  60s + 45s watchdog, but should be fixed before parity gate.
- `session_before_compact` is observability-only — Pi's compaction pipeline
  expects a `CompactionResult`, not a filtered message list. Up-memory's
  preserve-list is logged but doesn't drive Pi's compactor.

## Wave F state (2026-04-26 — post-cleanup)

`Dockerfile.pi` is renamed to `Dockerfile` — the Pi-runtime image is the
only one. The legacy all-in-one Dockerfile (PG/Dragonfly/QuestDB/Redpanda
+ ingest + job_engine) and `build.sh` are deleted along with the s6
service directories for `job-engine-startup` / `job-engine-cycle` and
the `agent/scripts/lint-skills-sync.sh` helper (job_engine source is
gone — Pi pod is the sole skill source).

The build is now plain `docker build -t up-pi-pod:<tag> .` (no helper
script, no parent-dir build context, no UP_SOURCE / JOB_ENGINE_SOURCE
build args). PR template + `tests/test_image_build.sh` updated to
target the < 600 MB Pi-runtime ceiling instead of the < 2.5 GB
all-in-one ceiling.
