#!/usr/bin/env bash
# End-to-end comparison harness: brings up POC, benches it, tears down;
# repeats for the upstream RI; writes bench/results.md with the comparison.
#
# Usage: bash bench/compare.sh
# Knobs:  COUNT=500 RI_DIR=/abs/path/to/apap/server bash bench/compare.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
POC_DIR="$(cd "$HERE/.." && pwd)"
RI_DIR="${RI_DIR:-$POC_DIR/../apap/server}"
COUNT="${COUNT:-200}"

if [ ! -d "$RI_DIR" ]; then
  echo "RI_DIR not found at $RI_DIR. Set RI_DIR=/abs/path/to/apap/server" >&2
  exit 1
fi

# Free port 9000 / 5432 if anything is squatting on them — both stacks bind those.
ensure_ports_free() {
  for port in 9000 5432; do
    if lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | tail -n +2 | head -1 >/dev/null; then
      echo "Port $port is in use. Stop the listener before running the bench." >&2
      lsof -iTCP:"$port" -sTCP:LISTEN -P -n >&2 || true
      exit 1
    fi
  done
}

wait_for() {
  local url="$1"
  local tries=60
  while [ $tries -gt 0 ]; do
    if curl -fsS "$url" > /dev/null 2>&1; then return 0; fi
    sleep 1
    tries=$((tries - 1))
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

run_one() {
  local label="$1"
  local dir="$2"
  local healthcheck_path="$3"

  echo "=== [$label] docker compose up at $dir ===" >&2
  (cd "$dir" && docker compose up -d --build)
  wait_for "http://localhost:9000$healthcheck_path"

  echo "=== [$label] seeding ===" >&2
  local agreement_id
  agreement_id="$(BASE_URL=http://localhost:9000 bash "$HERE/seed.sh")"
  echo "[$label] agreement id: $agreement_id" >&2

  echo "=== [$label] probing ($COUNT iterations REST + MCP) ===" >&2
  (cd "$POC_DIR" && node "$HERE/probe.mjs" \
    --server-label="$label" \
    --base-url=http://localhost:9000 \
    --agreement-id="$agreement_id" \
    --count="$COUNT" > "$HERE/results-$label.json")

  echo "=== [$label] tearing down (volumes removed) ===" >&2
  (cd "$dir" && docker compose down -v) > /dev/null 2>&1 || true
}

ensure_ports_free
run_one poc "$POC_DIR" "/healthz"
ensure_ports_free
run_one ri  "$RI_DIR"  "/capabilities"

echo "=== building report ===" >&2
node "$HERE/report.mjs" "$HERE/results-poc.json" "$HERE/results-ri.json" > "$HERE/results.md"
echo "Done. See bench/results.md"
