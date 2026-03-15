#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

wait_for_url() {
    local url="$1"
    local label="$2"
    local attempts="${3:-30}"
    local i

    for ((i = 1; i <= attempts; i++)); do
        if curl -fsS "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done

    echo "$label did not become ready at $url"
    return 1
}

cleanup() {
    kill "${MCP_PID:-}" "${AGENT_PID:-}" 2>/dev/null || true
}

echo "Starting MedAssist services..."

# Start MCP Server in background
echo "Starting MCP Server on port ${MCP_SERVER_PORT:-3001}..."
cd "$ROOT_DIR/mcp-server"
npm run dev &
MCP_PID=$!

trap cleanup EXIT INT TERM

wait_for_url "http://localhost:${MCP_SERVER_PORT:-3001}/health" "MCP server"

# Start A2A Agent
echo "Starting A2A Agent on port ${AGENT_PORT:-8001}..."
cd "$ROOT_DIR/agent"
if [ -x .venv/bin/uvicorn ]; then
    AGENT_VENV_DIR=".venv"
elif [ -x venv/bin/uvicorn ]; then
    AGENT_VENV_DIR="venv"
else
    echo "Agent virtualenv not found. Run ./scripts/setup.sh first."
    kill "$MCP_PID" 2>/dev/null || true
    exit 1
fi

"$AGENT_VENV_DIR/bin/uvicorn" medassist.main:app --host 0.0.0.0 --port "${AGENT_PORT:-8001}" &
AGENT_PID=$!

wait_for_url "http://localhost:${AGENT_PORT:-8001}/health" "A2A agent"

echo ""
echo "MedAssist services running:"
echo "  MCP Server: http://localhost:${MCP_SERVER_PORT:-3001}/mcp"
echo "  A2A Agent:  http://localhost:${AGENT_PORT:-8001}"
echo ""
echo "Press Ctrl+C to stop all services"

wait
