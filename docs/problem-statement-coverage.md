# Agents Assemble — Problem Statement Coverage

This document maps the published "Agents Assemble Challenge" requirements to where they are satisfied in this repo. Last verified 2026-04-27.

## The challenge (paraphrased from the published page)

> Build a Superpower (MCP server) or an Agent (A2A) for healthcare workflows. Use SHARP for context propagation. Optionally use FHIR data. Publish in the Prompt Opinion Marketplace. Submit a <3-minute demo video showing the project functioning within Prompt Opinion.

## Coverage matrix

| Requirement | Status | Where it lives |
|-------------|--------|----------------|
| **Build a Superpower (MCP)** — required if not building an agent. Forge a capability any agent can use. | ✓ — and we built both | `mcp-server/` — eight registered tools, `createMcpServer()` advertises the `ai.promptopinion/fhir-context` extension, six rule-based + one LLM-powered + one orchestrator |
| **Build an Agent (A2A)** — alternative path. Conversational interoperability via A2A. | ✓ — and we built both | `agent/` — Google ADK + `to_a2a()`, four specialist sub-agents, A2A v1 agent card via the `AgentCardV1`/`AgentExtensionV1` shim, `before_model_callback` hook in `medassist/sharp/fhir_hook.py`, ADK-native `header_provider` callable for outbound MCP calls |
| **Use SHARP Extension Specs for healthcare context propagation** | ✓ end-to-end, verified live | `mcp-server/src/auth/sharp-context.ts` reads canonical headers (`X-Patient-ID`, `X-FHIR-Server-URL`, `X-FHIR-Access-Token`) case-insensitively with JWT-claim precedence; `agent/medassist/sharp/fhir_hook.py` extracts `metadata["https://app.promptopinion.ai/schemas/a2a/v1/fhir-context"]` from inbound A2A requests and forwards as canonical SHARP headers on outbound MCP calls |
| **MCP capability declaration on `initialize`** (so the platform knows the server accepts FHIR context) | ✓ | `mcp-server/src/server.ts` declares `capabilities.extensions["ai.promptopinion/fhir-context"]` with the SMART scopes the eight tools need; verified live by `tests/server-capabilities.test.ts` and by curl handshake |
| **A2A v1 agent card schema** (`supportedInterfaces[]`, typed `securitySchemes`, `capabilities.extensions[]`, no top-level `url`/`preferredTransport`) | ✓ verified live | `agent/medassist/a2a/agent_card.py` shim mirrors `po-adk-python/shared/app_factory.py`; `tests/test_agent_card.py` asserts the shape; `curl /.well-known/agent-card.json` returns the v1 form |
| **MCP session lifecycle for live clients** (initialize → mcp-session-id header → subsequent calls reuse the session) | ✓ regression-protected | `mcp-server/src/index.ts` uses the SDK's `onsessioninitialized` callback to persist transports keyed by the SDK-allocated session id; `tests/mcp-session.test.ts` walks a real `initialize` → `tools/list` round-trip and asserts all 8 tools appear |
| **Highly recommended: use FHIR data** | ✓ live against public HAPI sandbox | `mcp-server/src/fhir/` — typed FHIRClient + per-resource query helpers; three Synthea patients verified end-to-end and frozen in [test-scenarios.md](test-scenarios.md) |
| **Synthetic / de-identified data only — real PHI is automatic disqualification** | ✓ enforced by default | `.env.example` and `docs/test-scenarios.md` only reference the public HAPI Synthea sandbox; no production FHIR URL appears anywhere in the repo |
| **AI Factor** — uses generative AI for what rule-based code cannot | ✓ | `mcp-server/src/tools/differential-diagnosis.ts` — takes a chief complaint, fetches patient summary as grounding context (with iteration 2's FHIR citations), calls the configured LLM, parses JSON, renders ranked differential with cited supporting/contradicting findings and recommended next steps. Live-verified against the polypharmacy hero |
| **Potential Impact** — significant pain point with hypothesized improvement to outcomes / cost / time | ✓ — concrete claim | `clinical_handoff` tool composes five tools into a single shift-handoff document with a numbered action list. The "before MedAssist clinicians spend ~10 min per patient on shift handoff" claim is the demo's quantitative hook |
| **Feasibility** — viable in real systems, respects privacy / safety / regulation | ✓ | Inline FHIR resource citations (`Type/id`) on every clinical claim — auditability is a first-order feasibility signal in healthcare. Tools are deterministic except for the explicitly-LLM-powered one. Synthetic-only data. Standards-compliant SHARP + A2A v1 |
| **Reference implementations** | ✓ followed | MCP server mirrors the capability-declaration shape from `po-community-mcp/typescript/index.ts`. A2A agent card uses the v1 shim from `po-adk-python/shared/app_factory.py`. Both referenced inline in source comments |

## What's the user's responsibility (Track C / Track D)

Three submission requirements remain manual / external. They were explicitly reserved by the user during this session:

| Requirement | Where it lives in the plan | Why it's user-owned |
|-------------|----------------------------|---------------------|
| **Public deployment** so the agent card and `/mcp` endpoint are reachable from the internet | Track C in `docs/plans/2026-04-27-001-feat-ship-medassist-agents-assemble-plan.md` | Requires a hosting account (Render / Cloud Run / Fly) and live domain. Both Dockerfiles are present; the user just runs the deploy |
| **Publish to Prompt Opinion Marketplace** by registering the public agent-card URL through the External Agents UI | Track D, Unit D1 | Requires Prompt Opinion login; UI-driven |
| **In-platform smoke test** with a curated patient | Track D, Unit D2 | Requires the registered agent to be reachable; 2-3 minutes of click-through |
| **Record <3min demo video showing functioning within Prompt Opinion** | Track D, Unit D3 | Requires recording software + the live registration |
| **Submit on Devpost before 2026-05-11 23:00 ET** | Track D, Unit D4 | Administrative |

## Ship-blockers found in this audit pass

One real bug surfaced during the live `tools/list` walkthrough:

- **MCP session lifecycle bug**: `transports.set(transport.sessionId, transport)` ran before `handleRequest` allocated the session id, so the transport was never stored. Any client that did `initialize` then sent a subsequent request (which is the normal MCP flow Prompt Opinion would use) hit `400 Invalid or expired session`. **Fixed**: switched to the SDK's `onsessioninitialized` callback. Regression-protected by `tests/mcp-session.test.ts`.

Without that fix, MedAssist would have appeared registered in the marketplace but every tool call would have failed.

## What to read

- [README](../README.md) — top-level overview, quickstart, tools matrix
- [project-status.md](project-status.md) — iteration log, verification results, morning handoff
- [eval-results.md](eval-results.md) — measurable quality claims, regenerated by `npm run eval`
- [test-scenarios.md](test-scenarios.md) — verified Synthea demo patients
- [demo-script.md](demo-script.md) — submission walkthrough
- [plans/](plans/) — five sequential plan documents
- [brainstorms/](brainstorms/) — feature prioritization against the judging rubric
