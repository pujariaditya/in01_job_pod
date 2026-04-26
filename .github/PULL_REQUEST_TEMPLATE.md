## Summary

<!-- 1-3 sentences. What changed and why. -->

## Linked issue

<!-- Closes #N -->

## Changes

- 
- 

## Verification

- [ ] `./build.sh` succeeds locally on arm64
- [ ] Image size delta is reasonable (current baseline: ~515 MB)
- [ ] All supervised services come up cleanly (`docker logs` shows no s6 oneshot failures)
- [ ] `healthcheck.sh` returns 0 after the boot grace period
- [ ] No new build args (or: documented in README's Build section)

## Risk

<!-- What could regress? Roll-back plan. -->
