# job_pod — All-in-One Docker Image

Per spec §4.1: bundles PG-17 + Dragonfly + QuestDB + Redpanda + UP's 5 ingest
processes + the job_engine Node binaries (`startup` + `cycle`), supervised by
s6-overlay 3.x. customer_backend's `spawn_job_pod` (Wave 6) launches one of
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

## Supervised services (11 total)

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
