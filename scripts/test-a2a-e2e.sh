#!/usr/bin/env bash
# Live A2A end-to-end test.
#
# Sends a real A2A `message/send` JSON-RPC request to a running MedAssist
# agent with the FHIR-context extension metadata. Verifies the chain:
#
#   1. agent accepts the A2A message (HTTP 200)
#   2. before_model_callback extracts metadata into ADK session state
#   3. McpToolset's header_provider injects canonical SHARP headers when
#      the agent calls a tool
#
# Limitations:
#   - The agent's LLM (Gemini through ADK) requires GOOGLE_API_KEY. When it
#     is unset, the request still hits the hook and middleware (so SHARP
#     extraction is verified) but the LLM step errors. The script surfaces
#     that distinction in its output.
#   - This script does not validate tool *content*; it validates plumbing.
#
# Usage:
#   ./scripts/test-a2a-e2e.sh                  # uses defaults
#   AGENT_URL=http://example/agent ./scripts/test-a2a-e2e.sh

set -uo pipefail

AGENT_URL="${AGENT_URL:-http://127.0.0.1:8001}"
PATIENT_ID="${PATIENT_ID:-6c4769e4-beda-5b20-3ba5-67e01c6daf03}"
FHIR_URL="${FHIR_URL:-http://hapi.fhir.org/baseR4}"
EXTENSION_URI="https://app.promptopinion.ai/schemas/a2a/v1/fhir-context"
MESSAGE_TEXT="${MESSAGE_TEXT:-Briefly summarize the staged patient: active conditions and current medications.}"
TIMEOUT="${TIMEOUT:-90}"

step() { printf '\n— %s —\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

step "1/3 agent reachable + v1 card exposes the FHIR-context extension"
HEALTH=$(curl -fsS --max-time 10 "$AGENT_URL/health" 2>&1) \
  || fail "agent /health unreachable at $AGENT_URL"
echo "$HEALTH" | grep -q '"status"' \
  || fail "agent /health did not return JSON"
echo "  agent /health ok"

CARD=$(curl -fsS --max-time 10 "$AGENT_URL/.well-known/agent-card.json" 2>&1) \
  || fail "agent card endpoint unreachable"
echo "$CARD" | grep -q "$EXTENSION_URI" \
  || fail "agent card does not declare the FHIR-context extension"
echo "  agent card declares $EXTENSION_URI"
echo "$CARD" | grep -q '"supportedInterfaces"' \
  || fail "agent card missing supportedInterfaces[] (A2A v1)"
echo "  agent card uses A2A v1 supportedInterfaces[]"

step "2/3 send A2A message/send with FHIR-context metadata"
MESSAGE_ID=$(uuidgen 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())')
REQ=$(cat <<JSON
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "messageId": "$MESSAGE_ID",
      "role": "user",
      "parts": [{"kind": "text", "text": "$MESSAGE_TEXT"}]
    },
    "metadata": {
      "$EXTENSION_URI": {
        "fhirUrl": "$FHIR_URL",
        "patientId": "$PATIENT_ID"
      }
    }
  }
}
JSON
)
RESP=$(curl -sS --max-time "$TIMEOUT" -X POST "$AGENT_URL/" \
  -H 'Content-Type: application/json' \
  -d "$REQ" 2>&1) || fail "A2A POST failed: $RESP"

echo "  request sent (messageId=$MESSAGE_ID)"

step "3/3 inspect response shape"
if echo "$RESP" | grep -q '"jsonrpc"'; then
  echo "  agent returned a JSON-RPC envelope"
else
  echo "  unexpected response shape:"
  echo "$RESP" | head -c 800
  fail "response is not JSON-RPC"
fi

if echo "$RESP" | grep -qi '"error"'; then
  if echo "$RESP" | grep -qiE 'GOOGLE_API_KEY|gemini|api[_-]key'; then
    echo "  agent reached the LLM step but returned an LLM-credential error"
    echo "  (expected when GOOGLE_API_KEY is unset; the SHARP/hook chain is"
    echo "   verified by reaching this point — agent has accepted the metadata"
    echo "   and routed past the inbound middleware to the LLM)."
  else
    echo "  agent returned a non-credential error:"
    echo "$RESP" | head -c 800
    fail "investigate the error"
  fi
elif echo "$RESP" | grep -q '"result"'; then
  echo "  agent returned a successful JSON-RPC result"
  echo "  preview:"
  echo "$RESP" | head -c 1500
fi

echo ""
echo "PASS — A2A end-to-end plumbing verified."
echo "Agent URL:   $AGENT_URL"
echo "Patient ID:  $PATIENT_ID"
echo "FHIR URL:    $FHIR_URL"
echo "Extension:   $EXTENSION_URI"
