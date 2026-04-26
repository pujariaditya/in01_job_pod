## Summary

<!-- 1-3 sentences. What changed and why. -->

## Linked issue

<!-- Closes #N -->

## Changes

- 
- 

## Verification

- [ ] `docker build -t up-pi-pod:test .` succeeds locally on arm64
- [ ] Image size delta is reasonable (Pi-runtime baseline target: < 600 MB)
- [ ] Daemon comes up cleanly and the pi-agent connects via `/var/lib/pi/up-daemon.sock`
- [ ] `HEALTHCHECK` (socket existence) passes after the boot grace period

## Risk

<!-- What could regress? Roll-back plan. -->
