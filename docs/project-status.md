# MedAssist Project Status

Last updated: 2026-04-27 (post-iteration-6, six iterations on `main`).

## Iterations on main

| # | Commit | What it shipped |
|---|--------|-----------------|
| 1 | `8515ec3` | Snapshot of pre-rebuild dashboard work + the multi-track ship plan |
| 2 | `3414518` | Track A — SHARP correctness (canonical headers, MCP capability declaration, A2A FHIR-context hook, agent card v1) |
| 3 | `66e6f4e` | Track B — frontend rebuild as editorial-clinical workbench |
| 4 | `b4737fe` | gitignore .tmp-screenshots/ |
| 5 | `6218a62` | E1 — verified Synthea demo patients + project-status update |
| 6 | `2050393` | F2 — inline FHIR resource citations on every clinical claim |
| 7 | `1ae94e3` | F1 — `differential_diagnosis` LLM-powered MCP tool with cited reasoning |
| 8 | `3b48523` | F3 + polish — `clinical_handoff` orchestrator + abbreviated FHIR-ref rendering + curated demo scenarios |
| 9 | `01a1fe0` | F4 — deterministic quality eval harness emitting `docs/eval-results.md` |

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

### Iteration 6: citations, LLM differential, handoff, eval (commits 2050393–01a1fe0)

- Every clinical claim emitted by patient_summary, interpret_lab_results, check_drug_interactions, and identify_care_gaps carries a `Type/id` FHIR resource reference that the dashboard abbreviates to `Type/…<last 8>` (full id in `title=` for hover audit). The differential-diagnosis LLM tool sees these citations in its grounding context and re-cites them in supporting findings — a clinician can audit every claim back to its FHIR resource.
- `differential_diagnosis` (7th MCP tool) is the AI-Factor showcase. Takes a chief complaint, fetches patient summary as grounding context, calls an OpenAI-compatible LLM (NOWBIND/Azure default, OpenAI fallback), parses JSON, renders ranked candidates with supporting / contradicting findings, recommended next steps, and ICD/SNOMED codes. Live-verified with NOWBIND/`gpt-4o` against the polypharmacy hero — produced a clinically coherent ranked DDx (CHF, CKD, nephrotic syndrome, cirrhosis, hypothyroidism) citing actual `Condition/...` resources from her record. LLM client is deferred-injectable in tests (no live calls in CI).
- `clinical_handoff` (8th MCP tool) composes patient_summary + interpret_lab_results + check_drug_interactions + identify_care_gaps + auto-selected risk scores into a structured shift-handoff document. Risk-score selection is condition-driven (CHA2DS2-VASc on AFib, ASCVD on cardiac risk factors, CKD-EPI on renal disease). Action items are derived from what's actually flagged. Sequential orchestration to stay friendly with the public HAPI sandbox.
- Quality eval harness (`npm run eval` from mcp-server) regenerates [docs/eval-results.md](eval-results.md) with per-tool latency, citation density, and section-presence metrics. Initial run: 8/8 tools pass section presence, sub-millisecond per-tool against the in-memory fixture, 29 FHIR citations across the run.

### Test coverage

- MCP server: **209 tests** across 13 suites (was 161 pre-Track-A; +48 across the iterations).
- Agent: 69 tests across 4 suites (was 34; +35 in Track A).
- TypeScript `tsc --noEmit` clean.
- `docs/eval-results.md` regenerated with `npm run eval`.

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

## Repository Layout (current)

- `mcp-server/` — TypeScript MCP server with **eight** clinical tools (six rule-based, one LLM-powered, one orchestrator), 209 tests.
- `mcp-server/scripts/eval.ts` — deterministic quality eval harness; `npm run eval` regenerates `docs/eval-results.md`.
- `mcp-server/src/external/llm.ts` — OpenAI-compatible client factory (NOWBIND default, OpenAI fallback).
- `agent/` — Python A2A agent (Google ADK + `to_a2a()`), four sub-agents, 69 tests.
- `frontend/` — rebuilt clinical workbench dashboard. Files: `design-tokens.css`, `styles.css`, `index.html`, `app.js`.
- `docs/plans/` — five sequential plan documents (snapshot ship plan, citations, differential diagnosis, handoff + polish, eval harness).
- `docs/brainstorms/` — feature prioritization against hackathon judging rubric.
- `docs/test-scenarios.md` — three Synthea demo patients + legacy fixture-based scenarios.
- `docs/eval-results.md` — measurable quality claims regeneratable on demand.
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
