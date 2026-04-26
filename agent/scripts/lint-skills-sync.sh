#!/usr/bin/env bash
set -euo pipefail
diff -r ../job_engine/skills/strategies job_pod/.pi/skills/strategies > /dev/null && \
    echo "skills in sync" || \
    { echo "DRIFT: job_pod/.pi/skills out of sync with job_engine/skills"; exit 1; }
