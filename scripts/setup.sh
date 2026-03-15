#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting up MedAssist development environment..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required."; exit 1; }

if command -v python3.12 >/dev/null 2>&1; then
    PYTHON_BIN="python3.12"
elif command -v python3.11 >/dev/null 2>&1; then
    PYTHON_BIN="python3.11"
else
    PYTHON_BIN="python3"
fi

echo "Using Python interpreter: $PYTHON_BIN"

# Setup MCP Server
echo "Installing MCP Server dependencies..."
cd "$ROOT_DIR/mcp-server"
npm install

# Setup Agent
echo "Setting up Python Agent..."
cd "$ROOT_DIR/agent"
"$PYTHON_BIN" -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Copy env file if not exists
cd "$ROOT_DIR"
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example — please fill in your API keys"
fi

echo ""
echo "Setup complete! Run './scripts/run-all.sh' to start services."
