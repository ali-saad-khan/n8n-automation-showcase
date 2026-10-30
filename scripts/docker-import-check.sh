#!/usr/bin/env bash
# Imports every workflow into a throwaway n8n container (fresh SQLite DB inside the container,
# destroyed on exit via --rm). Nothing is written to the repo. Requires Docker + network for the image pull.
set -uo pipefail
cd "$(dirname "$0")/.."
IMAGE="${N8N_IMAGE:-n8nio/n8n:latest}"
fail=0
docker run --rm --entrypoint sh -v "$PWD/workflows:/workflows:ro" \
  -e N8N_USER_FOLDER=/tmp/n8n-throwaway -e N8N_DIAGNOSTICS_ENABLED=false \
  "$IMAGE" -c '
    n8n --version
    for f in /workflows/*.json; do
      if n8n import:workflow --input="$f" >/tmp/out.log 2>&1; then echo "IMPORT OK   $(basename "$f")"; else echo "IMPORT FAIL $(basename "$f")"; cat /tmp/out.log; rc=1; fi
    done
    echo "--- workflows now in throwaway DB:"; n8n list:workflow 2>/dev/null
    exit ${rc:-0}
  ' || fail=1
exit $fail
