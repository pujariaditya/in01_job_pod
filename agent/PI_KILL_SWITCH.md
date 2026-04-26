# Pi-runtime Kill Switch (Wave C)

Pi pods only run when explicitly requested via `runtime=pi` or `runtime=both`
in `customer_backend.infra.docker_orchestrator.spawn_job_pod`. The default
remains `runtime=job_engine`. Rollback is configurational, not code-based.

## Stop a single shadow pod

```bash
docker stop pi_pod_<job_id>_shadow
docker rm pi_pod_<job_id>_shadow
```

The job_engine pod is unaffected.

## Disable Pi entirely

Set the spawner default back to `runtime="job_engine"` in
`customer_backend/customer_backend/infra/docker_orchestrator.py` (already
the default — flip any feature-flag wrappers in admin_backend if added).

The `up-pi-pod` image and the daemon continue to exist; nothing
production-routes through them.

## Hard rollback (full Wave C revert)

```bash
git revert wave-c-complete..HEAD
docker compose down up-pi-pod || true
docker rmi up-pi-pod:wave-c
```

Wave A daemon and Wave B handler fan-out remain in place; they are
independent of Wave C.
