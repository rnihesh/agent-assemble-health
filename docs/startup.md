# MedAssist Startup Guide

This guide shows how to start each part of MedAssist by itself, or how to start the full stack together.

## Current State

At the time this guide was written, the local services were not running:

- MCP server on `http://127.0.0.1:3001`
- Agent on `http://127.0.0.1:8001`

## Prerequisites

- Node.js installed
- Python 3.11+ installed
- A repo-root `.env` file present

If you do not have a `.env` yet:

```bash
cp .env.example .env
```

Important variables:

- `FHIR_BASE_URL`
- `FHIR_ACCESS_TOKEN` if your FHIR server requires auth
- `GOOGLE_API_KEY` if you want the agent to use Gemini through ADK
- `MCP_SERVER_PORT` if you do not want to use `3001`
- `AGENT_PORT` if you do not want to use `8001`
- `AGENT_PUBLIC_URL` for externally reachable agent-card URLs

## One-Time Setup

From the repo root:

```bash
./scripts/setup.sh
```

What it does:

- installs MCP server dependencies with `npm install`
- creates `agent/.venv`
- installs the Python agent in editable mode with dev dependencies
- creates `.env` from `.env.example` if missing

## Start The MCP Server Only

The frontend is served by the MCP server. There is no separate frontend process.

Development mode:

```bash
cd mcp-server
npm run dev
```

Production-style local run:

```bash
cd mcp-server
npm run build
npm run start
```

Useful MCP endpoints:

- `http://localhost:3001/health`
- `http://localhost:3001/health?deep=1`
- `http://localhost:3001/mcp`
- `http://localhost:3001/app`

## Start The Agent Only

From the repo root:

```bash
cd agent
.venv/bin/uvicorn medassist.main:app --host 0.0.0.0 --port "${AGENT_PORT:-8001}"
```

If your virtualenv is named `venv` instead of `.venv`, use:

```bash
cd agent
venv/bin/uvicorn medassist.main:app --host 0.0.0.0 --port "${AGENT_PORT:-8001}"
```

Useful agent endpoints:

- `http://localhost:8001/health`
- `http://localhost:8001/.well-known/agent-card.json`

Note:

- the agent expects the MCP server URL from `.env`
- by default the project uses `http://localhost:3001/mcp`

## Start The Full Stack

From the repo root:

```bash
./scripts/run-all.sh
```

What it does:

- loads repo-root `.env`
- starts the MCP server
- waits for MCP health
- starts the A2A agent
- waits for agent health
- keeps both processes attached until you stop them

Open the dashboard at:

```text
http://localhost:3001/app
```

## Start With Docker

From the repo root:

```bash
docker compose up --build
```

This starts:

- `mcp-server`
- `agent`

When healthy, open:

```text
http://localhost:3001/app
```

To stop Docker services:

```bash
docker compose down
```

## Verify Startup

After the stack is up:

```bash
./scripts/smoke-test.sh
```

Optional patient-level checks:

```bash
SMOKE_PATIENT_ID="your-patient-id" ./scripts/smoke-test.sh
```

## Stop The Services

If you started with `./scripts/run-all.sh`:

- press `Ctrl+C` in that terminal

If you started services manually:

- stop each terminal with `Ctrl+C`

If you started with Docker:

```bash
docker compose down
```

## Recommended Local Workflow

1. `./scripts/setup.sh`
2. Fill in `.env`
3. `./scripts/run-all.sh`
4. Open `http://localhost:3001/app`
5. `./scripts/smoke-test.sh`

