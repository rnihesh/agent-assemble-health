# MedAssist Project Status

Last updated: 2026-04-27 (post-Track-A, post-Track-B, post-E1).

## What Is Done

### Backend correctness (Track A, commit `3414518`)

- MCP server reads canonical SHARP HTTP headers (`X-Patient-ID`, `X-FHIR-Server-URL`, `X-FHIR-Access-Token`) case-insensitively, with `_meta` retained as fallback for the local dashboard's REST path. JWT `patient` claim takes precedence when present.
- MCP server advertises the `ai.promptopinion/fhir-context` extension in its `initialize` capabilities response with the full SMART scope set the six tools need (`patient/Patient.rs` required; `Observation/Condition/MedicationStatement/AllergyIntolerance/Immunization` read-search; `offline_access`). `fhir_context_required: { value: false }` keeps the local-mode dashboard working.
- A2A agent extracts FHIR context from inbound A2A request `metadata` keyed by `https://app.promptopinion.ai/schemas/a2a/v1/fhir-context` via a `before_model_callback`, writes it into ADK session state, and feeds it to `McpToolset` through the ADK-native `header_provider` callable. No HTTP-client subclassing, survives sub-agent fan-out.
- Agent card upgraded to A2A v1: `supportedInterfaces[]`, typed-key `securitySchemes`, `capabilities.stateTransitionHistory: false`, `capabilities.extensions[]` declaring the FHIR-context URI. No top-level `url` or `preferredTransport`. Built via the `AgentCardV1` / `AgentExtensionV1` shim mirrored from `po-adk-python`.

### Frontend rebuild (Track B, commit `66e6f4e`)

- Dashboard at `/app` rewritten as an editorial-clinical workbench. Slim tool rail (208px), wide central surface that mode-switches `idle | running | result | error`, persistent header strip with patient input + scenario menu + status indicator, one-click history drawer.
- Design tokens locked in `frontend/design-tokens.css`: Source Serif 4 / Inter / JetBrains Mono, deep ink + warm bone palette with one crimson accent (`#B23A48`), 4px spacing scale, motion 80/200/360ms. No gradients, orbs, or animated atmosphere.
- Result rendering reads as a clinical document: ~70ch measure, h2/h3 hierarchy with rules, tables with rules-between-rows and small-caps headers, mono-tinted inline IDs/values. Tool-specific loading copy. 404/"not found" responses route to a friendly empty-state error.
- REST API contract (`/api/system-status` and the six `POST /api/...` endpoints, all returning `{ result, error? }`) preserved verbatim — backend was not modified by Track B.

### Integration verification (E1, this session)

- MCP server boots cleanly on port 3001 and the `initialize` handshake against `/mcp` returns the `ai.promptopinion/fhir-context` extension declaration with all 7 SMART scopes verified live.
- A2A agent boots cleanly on port 8001 and serves the v1 agent card at `/.well-known/agent-card.json` with `supportedInterfaces`, `capabilities.extensions`, `securitySchemes` typed-key shape, no top-level `url`/`preferredTransport`.
- Three Synthea-generated demo patients were sourced on the public HAPI sandbox and exercised end-to-end against the rebuilt dashboard:
  - `6c4769e4-beda-5b20-3ba5-67e01c6daf03` — Mrs. Renata Considine, 72F (38 conditions, 37 meds, 554 obs, 15 immunizations) — polypharmacy hero.
  - `99dd324a-1a4e-f640-ab63-729bfd413be4` — Mr. Sal Pacocha, 67M (45 conditions, 27 meds, 580 obs, 13 immunizations) — risk-score hero.
  - `3236e622-25fc-dfc3-70a3-f501faa674eb` — Mr. Trent Padberg, 50M (45 conditions, 6 meds, 189 obs, 15 immunizations) — general clinical review.
  - All three are documented in [docs/test-scenarios.md](docs/test-scenarios.md) with verified tool outputs.
- Visual walkthrough via Chrome DevTools MCP confirmed the rebuilt dashboard renders rich Synthea data cleanly: patient_summary on Considine (22 conditions, immunization history), CHA2DS2-VASc on Pacocha (Score 2/9, High risk, DOAC recommendation, variables table with rules between rows), status popover showing all three services green.

### Test coverage

- MCP server: 184 tests passing across 9 suites (was 161 pre-Track-A, +23).
- Agent: 69 tests passing across 4 suites (was 34, +35).
- TypeScript `tsc --noEmit` clean.

## What Was Verified Locally (this session)

- `npm test --prefix mcp-server` — 184/184.
- `agent/.venv/bin/pytest` — 69/69.
- `npm run dev` boots MCP cleanly on `:3001`.
- `uvicorn medassist.main:app` boots agent cleanly on `:8001` with green `/health` and v1 agent card.
- `POST /mcp` handshake returns FHIR-context capability declaration with all 7 SMART scopes.
- `GET /.well-known/agent-card.json` returns v1-compliant card.
- `POST /api/patient-summary`, `POST /api/risk-score`, `POST /api/care-gaps`, `POST /api/clinical-guidelines` all return non-empty Markdown for the three Synthea patients.
- Dashboard at `/app` walked through patient_summary, risk_score, status popover via Chrome DevTools MCP — clean rendering, no JS errors (one residual 404 on a stale resource, non-blocking).
- Lighthouse desktop: Accessibility 94, Best Practices 96, SEO 100 (per Track B verification).

## What Is Still Left

External / manual / user-owned:

- **Track C — Public deploy**: deploy MCP server and agent to Render (or alternative). Requires `MCP_SERVER_URL`, `AGENT_PUBLIC_URL`, `GOOGLE_API_KEY`, `OPENFDA_API_KEY` (optional) wired into the deploy environment. User has explicitly reserved this for themselves.
- **Track D — Submission**: register the public agent-card URL in Prompt Opinion's External Agents UI; in-platform smoke test with the curated Synthea patients; record <3min demo video; submit on Devpost. User has explicitly reserved this for themselves.
- **Live A2A roundtrip with LLM**: requires `GOOGLE_API_KEY` to exercise Gemini through ADK. The hook + header-provider chain is unit-tested (9 tests in `test_fhir_hook.py`); the live LLM call path is exercised in deploy.

## Known Caveats

- Tool tests use mocked FHIR responses, not live integration. Verified end-to-end against the public HAPI sandbox during E1; future divergence between mock fixtures and real FHIR responses is possible.
- Public HAPI sandbox is not a guaranteed-uptime service. The three curated patient IDs were validated 2026-04-27 02:20 UTC.
- The agent card's `url` field is required by the upstream `a2a-sdk` 0.3.x but stripped from the served JSON via `serialize_agent_card_v1`. If a future SDK release adopts v1 natively, the shim can be removed.
- `serverInfo` does not declare authentication mode. Kept anonymous to match hackathon scope; SHARP spec permits it.

## Repository Layout (post-E1)

- `mcp-server/` — TypeScript MCP server with six clinical tools, 184 tests.
- `agent/` — Python A2A agent (Google ADK + `to_a2a()`), four sub-agents, 69 tests.
- `frontend/` — rebuilt clinical workbench dashboard. Files: `design-tokens.css`, `styles.css`, `index.html`, `app.js`.
- `docs/plans/` — multi-track ship plan and any subsequent plans.
- `docs/test-scenarios.md` — three Synthea demo patients + legacy fixture-based scenarios.
- `docs/promptopinion-submission.md` — user-owned, will exist after Track D.
- `scripts/` — `run-all.sh`, `setup.sh`, `smoke-test.sh`.

## Immediate Next Steps (User-Owned)

1. Deploy MCP server and agent publicly (Track C).
2. Register agent-card URL in Prompt Opinion (Track D, Unit D1).
3. Smoke test the registered agent against a workspace with one of the three demo patients (D2).
4. Record <3min demo video using `docs/demo-script.md` (D3).
5. Submit on Devpost before 2026-05-11 23:00 ET (D4).

## Autonomous Work Continuing

While the user is asleep, autonomous brainstorm-plan-work iterations continue per their instruction to ship until "hackathon-winning". Next iteration begins immediately after this commit. New plans will land in `docs/plans/` with sequential dating.
