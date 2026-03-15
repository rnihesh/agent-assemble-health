#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

MCP_BASE_URL="${MCP_BASE_URL:-http://localhost:${MCP_SERVER_PORT:-3001}}"
AGENT_BASE_URL="${AGENT_BASE_URL:-http://localhost:${AGENT_PORT:-8001}}"
SMOKE_CONDITION="${SMOKE_CONDITION:-diabetes}"

echo "Running MedAssist smoke test..."
echo "  MCP base URL:   $MCP_BASE_URL"
echo "  Agent base URL: $AGENT_BASE_URL"

curl -fsS "$MCP_BASE_URL/health" >/dev/null
echo "  [ok] MCP health endpoint"

curl -fsS "$MCP_BASE_URL/health?deep=1" >/dev/null
echo "  [ok] MCP deep health endpoint"

agent_health="$(curl -fsS "$AGENT_BASE_URL/health")"
if ! printf '%s' "$agent_health" | grep -q '"status": "ok"\|"status":"ok"'; then
    echo "Agent health check did not report status ok"
    exit 1
fi
echo "  [ok] Agent health endpoint"

agent_card="$(curl -fsS "$AGENT_BASE_URL/.well-known/agent-card.json")"
if ! printf '%s' "$agent_card" | grep -q '"name": "MedAssist"\|"name":"MedAssist"'; then
    echo "Agent card did not contain the expected agent name"
    exit 1
fi
echo "  [ok] Agent card endpoint"

guideline_response="$(curl -fsS \
    -H "Content-Type: application/json" \
    -d "{\"condition\":\"$SMOKE_CONDITION\"}" \
    "$MCP_BASE_URL/api/clinical-guidelines")"
if ! printf '%s' "$guideline_response" | grep -q '"result":\|"result":'; then
    echo "Clinical guideline smoke request did not return a result payload"
    exit 1
fi
echo "  [ok] Guideline API"

if [ -n "${SMOKE_PATIENT_ID:-}" ]; then
    echo "  Using patient smoke checks with patient ID: $SMOKE_PATIENT_ID"

    patient_summary_response="$(curl -fsS \
        -H "Content-Type: application/json" \
        -d "{\"patientId\":\"$SMOKE_PATIENT_ID\"}" \
        "$MCP_BASE_URL/api/patient-summary")"
    if ! printf '%s' "$patient_summary_response" | grep -q '"result":\|"result":'; then
        echo "Patient summary smoke request did not return a result payload"
        exit 1
    fi
    echo "  [ok] Patient summary API"

    care_gap_response="$(curl -fsS \
        -H "Content-Type: application/json" \
        -d "{\"patientId\":\"$SMOKE_PATIENT_ID\"}" \
        "$MCP_BASE_URL/api/care-gaps")"
    if ! printf '%s' "$care_gap_response" | grep -q '"result":\|"result":'; then
        echo "Care gap smoke request did not return a result payload"
        exit 1
    fi
    echo "  [ok] Care gaps API"
fi

echo "Smoke test completed successfully."
