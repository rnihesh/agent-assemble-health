#!/bin/bash
set -e

echo "Setting up MedAssist development environment..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required."; exit 1; }

# Setup MCP Server
echo "Installing MCP Server dependencies..."
cd "$(dirname "$0")/../mcp-server"
npm install

# Setup Agent
echo "Setting up Python Agent..."
cd "$(dirname "$0")/../agent"
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Copy env file if not exists
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example — please fill in your API keys"
fi

echo ""
echo "Setup complete! Run './scripts/run-all.sh' to start services."
