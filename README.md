# MedAssist

MedAssist is a healthcare AI submission for the Agents Assemble challenge. It combines:

- An MCP server with six clinical decision-support tools backed by FHIR
- An A2A agent that routes clinician requests across specialist sub-agents
- A command-center dashboard for local demo, manual testing, and live stack visibility

## Current Status

Local code status as of March 15, 2026:

- MCP server builds cleanly
- MCP test suite passes: 161 tests
- Agent test suite passes: 34 tests under Python 3.12
- Agent entrypoint and packaging issues found during verification have been fixed
- SHARP patient context now resolves across all patient-specific MCP tools
- Agent card and agent health endpoints are implemented and verified locally
- MCP and agent health endpoints have been verified together in a live local run
- Dashboard UX has been upgraded with stack-status cards, scenario presets, request preview, and local run history

Remaining submission work is mostly external or manual:

- Run the full stack against a live FHIR server or Prompt Opinion workspace
- Load synthetic/Synthea patients for demo use
- Record the submission demo video
- Publish the MCP server / agent in Prompt Opinion Marketplace

## Architecture

```text
Prompt Opinion / EHR launch
        |
        | SHARP context (_meta / headers)
        v
  MedAssist A2A Agent  ----------------------+
        |                                    |
        | A2A / ADK orchestration            |
        v                                    |
  MedAssist MCP Server                       |
        |                                    |
        | FHIR queries + clinical logic      |
        v                                    |
    FHIR R4 server + optional RxNorm/OpenFDA
```

## Repo Layout

```text
agent/        Python A2A agent, sub-agents, SHARP middleware, agent card
mcp-server/   TypeScript MCP server, FHIR client, clinical tools, tests
frontend/     Command-center dashboard served from the MCP server at /app
docs/         Plans, demo script, patient scenarios, project status
scripts/      Setup, local startup, and Synthea data loading helpers
```

## Tools Implemented

The MCP server exposes six tools:

1. `patient_summary`
2. `check_drug_interactions`
3. `interpret_lab_results`
4. `calculate_risk_score`
5. `identify_care_gaps`
6. `match_clinical_guidelines`

The agent orchestrates four specialist workflows:

1. `patient_review`
2. `medication_safety`
3. `risk_assessment`
4. `preventive_care`

## Quickstart

1. Use Python 3.12 if available. The setup script prefers `python3.12`, then `python3.11`, then `python3`.
2. Copy [.env.example](/Users/nihesh/Nihesh/agent-assemble-health/.env.example) to `.env` and fill in any needed values.
3. Run `./scripts/setup.sh`
4. Start the stack with `./scripts/run-all.sh`
5. Open `http://localhost:3001/app`

Optional helper:

- Run `./scripts/smoke-test.sh` after startup to verify the key local endpoints.

Key local endpoints:

- MCP server health: `http://localhost:3001/health`
- MCP deep health: `http://localhost:3001/health?deep=1`
- MCP transport: `http://localhost:3001/mcp`
- Dashboard: `http://localhost:3001/app`
- Agent health: `http://localhost:8001/health`
- Agent card: `http://localhost:8001/.well-known/agent-card.json`

## Verification

Verified in this workspace:

- `cd mcp-server && npm run build`
- `cd mcp-server && npm test -- --run`
- `python3 -m py_compile` against the agent package and tests
- `cd agent && ./venv/bin/pytest`
- `cd agent && ./venv/bin/python -c "import medassist.main"`
- Live check of `/.well-known/agent-card.json` and `/health` on a local `uvicorn` instance
- Live check of MCP `/health` and agent `/health` with both local services running
- End-to-end helper verification with `./scripts/run-all.sh` and `./scripts/smoke-test.sh`
- Browser validation of the `/app` dashboard flow, including scenario staging, stack refresh, and successful analysis rendering

## Deployment Assets

Deployment-oriented coding assets included in this repo:

- [docker-compose.yml](/Users/nihesh/Nihesh/agent-assemble-health/docker-compose.yml) for one-command local stack startup
- [mcp-server/Dockerfile](/Users/nihesh/Nihesh/agent-assemble-health/mcp-server/Dockerfile) for containerizing the MCP server
- [agent/Dockerfile](/Users/nihesh/Nihesh/agent-assemble-health/agent/Dockerfile) for containerizing the A2A agent
- [scripts/smoke-test.sh](/Users/nihesh/Nihesh/agent-assemble-health/scripts/smoke-test.sh) for post-startup verification

For public deployment, set `AGENT_PUBLIC_URL` so the served agent card reports the correct externally reachable URL.

Not yet verified here:

- End-to-end execution against Prompt Opinion or a live FHIR sandbox

## Demo Assets

- Demo flow: [docs/demo-script.md](/Users/nihesh/Nihesh/agent-assemble-health/docs/demo-script.md)
- Patient scenarios: [docs/test-scenarios.md](/Users/nihesh/Nihesh/agent-assemble-health/docs/test-scenarios.md)
- Startup guide: [docs/startup.md](/Users/nihesh/Nihesh/agent-assemble-health/docs/startup.md)
- Consolidated status: [docs/project-status.md](/Users/nihesh/Nihesh/agent-assemble-health/docs/project-status.md)
