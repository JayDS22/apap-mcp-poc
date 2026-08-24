#!/usr/bin/env bash
# ============================================================================
# demo-runner.sh - APAP MCP Demo Runner (GSoC 2026 final)
# ============================================================================
#
# Drives seven probes against a POC MCP server at http://localhost:9000 to
# demonstrate the twelve-week GSoC 2026 work on Idea #4 (Hardening the
# APAP/MCP Server):
#
#   PROBE 1 - typed-context hint       (initialize -> result.instructions)
#   PROBE 2 - resources                (resources/list includes protocol.cto)
#   PROBE 3 - Concerto schema          (resources/read of apap://schema/...)
#   PROBE 4 - typed error              (tools/call returns structured JSON)
#   PROBE 5 - shared service layer     (REST + MCP see the same rows)
#   PROBE 6 - subscriptions/listen     (SEP-2575 preview handler)
#   PROBE 7 - service layer purity     (no Express/SDK imports under services/)
#   PROBE 8 - SEP-2549 cache hints     (ReadResource returns ttlMs+cacheScope)
#
# Requirements:
#   - bash 4+ (works on macOS bash 3.2 too, no associative arrays used)
#   - curl
#   - jq
#   - grep
#   - a terminal that renders ANSI color escapes
#
# Usage:
#   ./demo-runner.sh
#
# A fully green run prints "8/8 probes green - demo ready" at the bottom and
# exits 0. Any red PROBE line indicates a regression that must be fixed before
# recording.
# ============================================================================

set -u

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL="http://localhost:9000"
MCP_URL="${BASE_URL}/mcp"
HEALTH_URL="${BASE_URL}/healthz"
PACE=1.5

# ANSI colors
GREEN='\033[1;32m'
RED='\033[1;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Probe pass/fail counters (plain positional variables, bash 3.2 safe)
PROBE1_OK=0
PROBE2_OK=0
PROBE3_OK=0
PROBE4_OK=0
PROBE5_OK=0
PROBE6_OK=0
PROBE7_OK=0
PROBE8_OK=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
say_green()  { printf "${GREEN}%s${RESET}\n" "$1"; }
say_red()    { printf "${RED}%s${RESET}\n"   "$1"; }
say_dim()    { printf "${DIM}%s${RESET}\n"   "$1"; }
say_bold()   { printf "${BOLD}%s${RESET}\n"  "$1"; }

separator() {
  printf "${DIM}----------------------------------------------------------------------${RESET}\n"
}

banner() {
  printf "\n"
  printf "${BOLD}======================================================================${RESET}\n"
  printf "${BOLD} APAP MCP Demo Runner - GSoC 2026 final${RESET}\n"
  printf "${BOLD} target: %s${RESET}\n" "$BASE_URL"
  printf "${BOLD}======================================================================${RESET}\n"
  printf "\n"
}

# Extract the JSON body from a Streamable-HTTP SSE response.
# Server frames each JSON-RPC response as `data: {...}` lines.
sse_to_json() {
  sed -n 's/^data: //p'
}

# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------
banner

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
say_bold "[health] GET ${HEALTH_URL}"
if curl -sf "${HEALTH_URL}" >/dev/null 2>&1; then
  say_green "server ready"
else
  say_red "server unreachable - is the POC MCP server running on ${BASE_URL}?"
  exit 1
fi
separator

# ---------------------------------------------------------------------------
# PROBE 1 - typed-context hint (initialize)
# ---------------------------------------------------------------------------
say_bold "[PROBE 1] typed-context hint  (initialize -> result.instructions)"

INIT_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-03-26","capabilities":{},"clientInfo":{"name":"demo-runner","version":"1.0.0"}}}'

INIT_HEADERS_FILE="$(mktemp -t apap-demo-init-headers.XXXXXX)"
INIT_BODY_FILE="$(mktemp -t apap-demo-init-body.XXXXXX)"
trap 'rm -f "$INIT_HEADERS_FILE" "$INIT_BODY_FILE"' EXIT

curl -sS \
  -D "$INIT_HEADERS_FILE" \
  -o "$INIT_BODY_FILE" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -X POST \
  --data "$INIT_PAYLOAD" \
  "$MCP_URL"

# Capture mcp-session-id header (case-insensitive, strip CR).
SESSION_ID="$(
  awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/ {
        sub(/^[^:]+:[[:space:]]*/, "");
        sub(/\r$/, "");
        print;
        exit }' "$INIT_HEADERS_FILE"
)"

if [ -z "$SESSION_ID" ]; then
  say_red "PROBE 1 FAILED - no mcp-session-id header returned from initialize"
else
  say_dim "session id: ${SESSION_ID}"
fi

INIT_JSON="$(sse_to_json < "$INIT_BODY_FILE")"
INSTRUCTIONS="$(printf '%s' "$INIT_JSON" | jq -r '.result.instructions // empty' 2>/dev/null)"

if [ -z "$INSTRUCTIONS" ] || [ "$INSTRUCTIONS" = "null" ]; then
  say_red "PROBE 1 FAILED - Concerto typed-context not wired"
else
  INSTR_LEN=${#INSTRUCTIONS}
  printf "${GREEN}instructions:${RESET} %s\n" "$INSTRUCTIONS"
  say_dim "length: ${INSTR_LEN} chars"
  PROBE1_OK=1
fi
separator

# ---------------------------------------------------------------------------
# initialized notification (silent)
# ---------------------------------------------------------------------------
if [ -n "$SESSION_ID" ]; then
  curl -sS \
    -o /dev/null \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -X POST \
    --data '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
    "$MCP_URL" >/dev/null 2>&1 || true
fi

sleep "$PACE"

# ---------------------------------------------------------------------------
# PROBE 2 - resources/list
# ---------------------------------------------------------------------------
say_bold "[PROBE 2] resources  (resources/list should include protocol.cto)"

LIST_PAYLOAD='{"jsonrpc":"2.0","id":2,"method":"resources/list","params":{}}'

LIST_RAW="$(
  curl -sS \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -X POST \
    --data "$LIST_PAYLOAD" \
    "$MCP_URL"
)"

LIST_JSON="$(printf '%s' "$LIST_RAW" | sse_to_json)"

# Pretty-print each resource as "<uri> (<name>)".
RESOURCES_LINES="$(
  printf '%s' "$LIST_JSON" \
    | jq -r '.result.resources[]? | "  \(.uri)  (\(.name // "?"))"' 2>/dev/null
)"

if [ -n "$RESOURCES_LINES" ]; then
  printf "%s\n" "$RESOURCES_LINES"
else
  say_dim "(no resources returned)"
fi

HAS_SCHEMA="$(
  printf '%s' "$LIST_JSON" \
    | jq -r '[.result.resources[]?.uri] | index("apap://schema/protocol.cto") // empty' 2>/dev/null
)"

if [ -z "$HAS_SCHEMA" ]; then
  say_red "PROBE 2 WARNING - schema resource not registered"
else
  say_green "apap://schema/protocol.cto is registered"
  PROBE2_OK=1
fi
separator

sleep "$PACE"

# ---------------------------------------------------------------------------
# PROBE 3 - Concerto schema (resources/read)
# ---------------------------------------------------------------------------
say_bold "[PROBE 3] Concerto schema  (resources/read apap://schema/protocol.cto)"

READ_PAYLOAD='{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"apap://schema/protocol.cto"}}'

READ_RAW="$(
  curl -sS \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -X POST \
    --data "$READ_PAYLOAD" \
    "$MCP_URL"
)"

READ_JSON="$(printf '%s' "$READ_RAW" | sse_to_json)"

# JSON-RPC error?
HAS_ERROR="$(printf '%s' "$READ_JSON" | jq -r 'if .error then "yes" else "" end' 2>/dev/null)"
HAS_RESULT="$(printf '%s' "$READ_JSON" | jq -r 'if .result then "yes" else "" end' 2>/dev/null)"

if [ "$HAS_ERROR" = "yes" ] || [ "$HAS_RESULT" != "yes" ]; then
  say_red "PROBE 3 FAILED - schema resource not found"
  ERR_MSG="$(printf '%s' "$READ_JSON" | jq -r '.error.message // empty' 2>/dev/null)"
  if [ -n "$ERR_MSG" ]; then
    say_dim "error: ${ERR_MSG}"
  fi
else
  R_URI="$(printf '%s'  "$READ_JSON" | jq -r '.result.contents[0].uri      // empty')"
  R_MIME="$(printf '%s' "$READ_JSON" | jq -r '.result.contents[0].mimeType // empty')"
  R_TEXT="$(printf '%s' "$READ_JSON" | jq -r '.result.contents[0].text     // empty')"
  R_LEN=${#R_TEXT}
  R_FIRST_LINE="$(printf '%s' "$R_TEXT" | awk 'NF{print;exit}')"

  printf "${GREEN}uri:${RESET}       %s\n" "$R_URI"
  printf "${GREEN}mimeType:${RESET}  %s\n" "$R_MIME"
  printf "${GREEN}length:${RESET}    %s chars\n" "$R_LEN"
  printf "${GREEN}first:${RESET}     %s\n" "$R_FIRST_LINE"
  PROBE3_OK=1
fi
separator

sleep "$PACE"

# ---------------------------------------------------------------------------
# PROBE 4 - typed error (tools/call getAgreement)
# ---------------------------------------------------------------------------
say_bold "[PROBE 4] typed error  (tools/call getAgreement id=999999)"

CALL_PAYLOAD='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"getAgreement","arguments":{"agreementId":"999999"}}}'

CALL_RAW="$(
  curl -sS \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -X POST \
    --data "$CALL_PAYLOAD" \
    "$MCP_URL"
)"

CALL_JSON="$(printf '%s' "$CALL_RAW" | sse_to_json)"

INNER_TEXT="$(printf '%s' "$CALL_JSON" | jq -r '.result.content[0].text // empty' 2>/dev/null)"

if [ -z "$INNER_TEXT" ]; then
  say_red "PROBE 4 FAILED - no result.content[0].text in response"
else
  # Try to parse the inner text as JSON.
  PARSED_SHAPE="$(
    printf '%s' "$INNER_TEXT" \
      | jq -e 'select(type=="object")
              | select(.error.code and .error.message and (.error.details|type=="object"))
              | .error' 2>/dev/null
  )"

  if [ -n "$PARSED_SHAPE" ]; then
    ERR_CODE="$(printf    '%s' "$PARSED_SHAPE" | jq -r '.code')"
    ERR_MSG="$(printf     '%s' "$PARSED_SHAPE" | jq -r '.message')"
    ERR_DETAILS="$(printf '%s' "$PARSED_SHAPE" | jq -c '.details')"

    say_green "typed error shape detected:"
    printf "${GREEN}  code:${RESET}    %s\n" "$ERR_CODE"
    printf "${GREEN}  message:${RESET} %s\n" "$ERR_MSG"
    printf "${GREEN}  details:${RESET} %s\n" "$ERR_DETAILS"
    PROBE4_OK=1
  else
    say_red "PROBE 4 FAILED - pre-slice-3 stringified shape"
    say_dim "content[0].text was:"
    printf "${DIM}  %s${RESET}\n" "$INNER_TEXT"
  fi
fi
separator

sleep "$PACE"

# ---------------------------------------------------------------------------
# PROBE 5 - shared service layer (REST + MCP see the same rows)
# ---------------------------------------------------------------------------
say_bold "[PROBE 5] shared service layer  (REST + MCP resource on one source)"

# REST GET /templates - a normal HTTP client's view.
REST_TEMPLATES_RAW="$(curl -sS "${BASE_URL}/templates" 2>/dev/null)"
# REST returns { count, items: [...] } envelope, so count the items array.
REST_COUNT="$(printf '%s' "$REST_TEMPLATES_RAW" | jq '.items | length // 0' 2>/dev/null || echo 0)"

# MCP resources/read apap://templates - the MCP client's view of the same data.
MCP_READ_PAYLOAD='{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"apap://templates"}}'
MCP_TEMPLATES_RAW="$(
  curl -sS \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -X POST \
    --data "$MCP_READ_PAYLOAD" \
    "$MCP_URL"
)"
MCP_TEMPLATES_JSON="$(printf '%s' "$MCP_TEMPLATES_RAW" | sse_to_json)"

# MCP returns contents[] as one entry per template (each with its own uri +
# JSON body), so the row count is the length of the contents array itself.
MCP_COUNT="$(printf '%s' "$MCP_TEMPLATES_JSON" | jq '.result.contents | length // 0' 2>/dev/null || echo 0)"

printf "${GREEN}REST GET /templates:${RESET}                    %s records\n" "$REST_COUNT"
printf "${GREEN}MCP resources/read apap://templates:${RESET}    %s records\n" "$MCP_COUNT"

if [ "$REST_COUNT" = "$MCP_COUNT" ]; then
  say_green "REST and MCP see the same row count - one source of truth, no localhost round-trip"
  PROBE5_OK=1
else
  say_red "PROBE 5 FAILED - REST/MCP row counts differ (REST=${REST_COUNT}, MCP=${MCP_COUNT})"
fi
separator

sleep "$PACE"

# ---------------------------------------------------------------------------
# PROBE 6 - subscriptions/listen (SEP-2575 preview)
# ---------------------------------------------------------------------------
say_bold "[PROBE 6] subscriptions/listen  (SEP-2575 preview handler)"

# isValidResourceUri only accepts item URIs (apap://templates/{id} or
# apap://agreements/{id}), not collection URIs. Subscribe to a specific
# template row that PROBE 2 already showed exists.
SUB_PAYLOAD='{"jsonrpc":"2.0","id":6,"method":"subscriptions/listen","params":{"uris":["apap://templates/1"]}}'

SUB_RAW="$(
  curl -sS \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -X POST \
    --data "$SUB_PAYLOAD" \
    "$MCP_URL"
)"

SUB_JSON="$(printf '%s' "$SUB_RAW" | sse_to_json)"
SUB_ID="$(printf '%s' "$SUB_JSON" | jq -r '.result.subscriptionId // empty' 2>/dev/null)"

if [ -z "$SUB_ID" ] || [ "$SUB_ID" = "null" ]; then
  say_red "PROBE 6 FAILED - subscriptions/listen did not return a subscriptionId"
  ERR_MSG="$(printf '%s' "$SUB_JSON" | jq -r '.error.message // empty' 2>/dev/null)"
  if [ -n "$ERR_MSG" ]; then
    say_dim "error: ${ERR_MSG}"
  fi
else
  say_green "subscription registered:"
  printf "${GREEN}  subscriptionId:${RESET} %s\n" "$SUB_ID"
  printf "${GREEN}  uris:${RESET}           apap://templates/1\n"
  PROBE6_OK=1
fi
separator

sleep "$PACE"

# ---------------------------------------------------------------------------
# PROBE 7 - service layer purity (no transport imports)
# ---------------------------------------------------------------------------
say_bold "[PROBE 7] service layer purity  (no Express/SDK imports in src/services/)"

SERVICE_FILES="$(ls src/services/*.ts 2>/dev/null | wc -l | tr -d ' ')"
FORBIDDEN_HITS="$(
  grep -rEc "from ['\"]express['\"]|from ['\"]@modelcontextprotocol" src/services/ 2>/dev/null \
    | awk -F: '{s+=$2} END {print s+0}'
)"

printf "${GREEN}service files scanned:${RESET}         %s\n" "$SERVICE_FILES"
printf "${GREEN}forbidden transport imports:${RESET}   %s\n" "$FORBIDDEN_HITS"

if [ "$FORBIDDEN_HITS" = "0" ]; then
  say_green "boundary holds - service layer is transport-agnostic"
  PROBE7_OK=1
else
  say_red "PROBE 7 FAILED - service layer imports transport code (defeats the refactor)"
  say_dim "leaking sites:"
  grep -rnE "from ['\"]express['\"]|from ['\"]@modelcontextprotocol" src/services/ 2>/dev/null | sed 's/^/  /'
fi
separator

sleep "$PACE"

# ---------------------------------------------------------------------------
# PROBE 8 - SEP-2549 cache hints (ttlMs + cacheScope on ReadResource)
# ---------------------------------------------------------------------------
say_bold "[PROBE 8] SEP-2549 cache hints  (ReadResource contents carry ttlMs + cacheScope)"

# Reuse the templates resource read from PROBE 5.
HINT_TTL="$(printf   '%s' "$MCP_TEMPLATES_JSON" | jq -r '.result.contents[0].ttlMs      // empty' 2>/dev/null)"
HINT_SCOPE="$(printf '%s' "$MCP_TEMPLATES_JSON" | jq -r '.result.contents[0].cacheScope // empty' 2>/dev/null)"

# Also read the immutable schema resource to show a different cache policy.
SCHEMA_READ_PAYLOAD='{"jsonrpc":"2.0","id":8,"method":"resources/read","params":{"uri":"apap://schema/protocol.cto"}}'
SCHEMA_RAW="$(
  curl -sS \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -X POST \
    --data "$SCHEMA_READ_PAYLOAD" \
    "$MCP_URL"
)"
SCHEMA_JSON="$(printf '%s' "$SCHEMA_RAW" | sse_to_json)"
SCHEMA_TTL="$(printf   '%s' "$SCHEMA_JSON" | jq -r '.result.contents[0].ttlMs      // empty' 2>/dev/null)"
SCHEMA_SCOPE="$(printf '%s' "$SCHEMA_JSON" | jq -r '.result.contents[0].cacheScope // empty' 2>/dev/null)"

if [ -z "$HINT_TTL" ] || [ -z "$HINT_SCOPE" ] || [ -z "$SCHEMA_TTL" ] || [ -z "$SCHEMA_SCOPE" ]; then
  say_red "PROBE 8 FAILED - ReadResource contents missing SEP-2549 cache fields"
  say_dim "  templates ttlMs='${HINT_TTL}' cacheScope='${HINT_SCOPE}'"
  say_dim "  schema    ttlMs='${SCHEMA_TTL}' cacheScope='${SCHEMA_SCOPE}'"
else
  say_green "SEP-2549 cache hints present:"
  printf "${GREEN}  apap://templates${RESET}                ttlMs=%s ms  scope=%s\n" "$HINT_TTL" "$HINT_SCOPE"
  printf "${GREEN}  apap://schema/protocol.cto${RESET}      ttlMs=%s ms  scope=%s\n" "$SCHEMA_TTL" "$SCHEMA_SCOPE"
  PROBE8_OK=1
fi
separator

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
PASS=$(( PROBE1_OK + PROBE2_OK + PROBE3_OK + PROBE4_OK + PROBE5_OK + PROBE6_OK + PROBE7_OK + PROBE8_OK ))

printf "\n"
if [ "$PASS" -eq 8 ]; then
  say_green "8/8 probes green - demo ready"
  exit 0
else
  say_red "${PASS}/8 probes green - see above"
  exit 1
fi
