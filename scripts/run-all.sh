#!/bin/bash
set -e

echo "Starting MedAssist services..."

# Start MCP Server in background
echo "Starting MCP Server on port ${MCP_SERVER_PORT:-3001}..."
cd "$(dirname "$0")/../mcp-server"
npm run dev &
MCP_PID=$!

# Wait for MCP server to be ready
sleep 3

# Start A2A Agent
echo "Starting A2A Agent on port ${AGENT_PORT:-8001}..."
cd "$(dirname "$0")/../agent"
uvicorn medassist.main:a2a_app --host 0.0.0.0 --port "${AGENT_PORT:-8001}" &
AGENT_PID=$!

echo ""
echo "MedAssist services running:"
echo "  MCP Server: http://localhost:${MCP_SERVER_PORT:-3001}/mcp"
echo "  A2A Agent:  http://localhost:${AGENT_PORT:-8001}"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $MCP_PID $AGENT_PID 2>/dev/null; exit" INT TERM
wait
