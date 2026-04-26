---
title: "feat: differential_diagnosis LLM-powered MCP tool"
type: feat
status: active
date: 2026-04-27
origin: docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md
---

# feat: differential_diagnosis LLM-powered MCP tool

## Overview

Add a seventh MCP tool, `differential_diagnosis`, that takes a patient ID + a clinician's chief-complaint string and produces a ranked differential with explicit reasoning over the patient's actual record. This is MedAssist's first tool whose answer cannot be produced by rule-based code alone — it directly addresses the hackathon's "AI Factor" criterion.

Implementation is contained: the MCP server gains an OpenAI-compatible client (NOWBIND-backed by default, direct OpenAI as fallback), a new tool that internally reuses `patientSummary()` for grounding, a new REST endpoint, and a new dashboard tile. The agent-side code is unchanged — the agent's `McpToolset` discovers the tool automatically.

## Problem Frame

The judges' rubric weights AI Factor heavily. MedAssist's six existing tools are deterministic clinical lookups (interaction matrix, USPSTF schedule, CHA2DS2-VASc point sums). A judge could ask "what does generative AI add that a non-AI system couldn't?" — and right now the visible answer is "tool routing and summary prose."

A differential-diagnosis tool grounded in the patient's longitudinal record is exactly an LLM strength: synthesizing structured data plus an unstructured chief complaint into a ranked clinical hypothesis space, with reasoning chains. Done well, this is the demo's marquee moment.

## Requirements Trace

- R1. New MCP tool `differential_diagnosis` exposed via the standard MCP tool registration path so the agent's `McpToolset` discovers it without code changes.
- R2. Tool input: `{ patientId: string, chiefComplaint: string, additionalContext?: string }`. Output: Markdown with ranked candidates, each citing patient findings by FHIR resource where applicable.
- R3. Tool fetches patient summary internally as grounding context (reuses existing `patientSummary` function to avoid circular HTTP).
- R4. LLM client is OpenAI-compatible. Default provider: NOWBIND (Azure proxy, env: `NOWBIND_AGENT_OPENAI_*`). Fallback: direct OpenAI (env: `OPENAI_API_KEY`, default model `gpt-4o-mini`). If neither is configured, the tool returns a clear error explaining the configuration miss — does not crash.
- R5. New REST endpoint `POST /api/differential-diagnosis` for dashboard consumption.
- R6. Dashboard adds a Differential Diagnosis tool with a chief-complaint textarea + Run.
- R7. Tests: unit tests for the tool with the LLM client mocked (no live calls in CI/test).
- R8. No new test count regression. No existing tool changes.

## Scope Boundaries

- **Not in scope:** streaming responses, conversational refinement, voice input, multi-LLM provider routing beyond NOWBIND/OpenAI, eval harness for output quality. Those are future iterations.
- **Not in scope:** integrating the tool into the A2A agent's sub-agent skill list. The MCP tool is automatically discoverable; an explicit sub-agent skill that orchestrates it can come later.
- **Not in scope:** caching, rate limiting, cost telemetry. Hackathon-scope.

### Deferred to Separate Tasks

- LLM-powered narrative wrap on existing tools: future iteration.
- Streaming SSE in the dashboard: future iteration.
- Differential-diagnosis sub-agent skill on the A2A side: future iteration once the MCP tool is verified.

## Context & Research

### Relevant code

- `mcp-server/src/tools/patient-summary.ts` — direct callable, use for grounding context.
- `mcp-server/src/server.ts` — MCP tool registration site.
- `mcp-server/src/index.ts` — Express REST endpoint additions.
- `mcp-server/src/config/env.ts` — env wiring for LLM credentials.
- `frontend/app.js`, `frontend/index.html` — adding a 7th tool tile.

### External dependencies

- `openai` npm package (~5kB gzipped, supports `baseURL` for Azure-compatible endpoints). Already widely used; stable.

## Key Technical Decisions

- **MCP tool, not agent sub-agent.** Mirrors the existing six tools — same registration, same REST surface, same dashboard pattern. The agent picks it up automatically through `McpToolset`. Keeps blast radius local to the MCP server.
- **NOWBIND default, OpenAI fallback.** User has more credits on NOWBIND; the tool checks `NOWBIND_AGENT_OPENAI_API_KEY` first, then `OPENAI_API_KEY`. If both are absent, the tool returns a Markdown error explaining how to configure — does not throw.
- **JSON-mode output then render to Markdown.** The LLM returns a structured JSON object (candidates array with name, likelihood, supporting findings, contradicting findings, next steps). The tool renders it to Markdown for consistency with the existing six tools' output shape. JSON-mode is supported by both NOWBIND/Azure and OpenAI.
- **Ground via `patientSummary` reuse.** Calling the function directly (not via HTTP) keeps the tool synchronous-clean and avoids a circular request. The patient summary already includes the FHIR citations from iteration 2 — the LLM sees the resource ids in its context and can refer to them in supporting findings.
- **Clinician disclaimer.** Output ends with a fixed disclaimer per the existing tools' pattern: "for clinical decision support; correlate with full clinical picture."
- **Temperature 0.2.** Low enough to be reproducible across runs for the same patient/complaint, high enough to permit ranking variation.
- **Max output tokens 1500.** Enough for 5 candidates with reasoning; bounded for cost.
- **Tests mock the OpenAI client at the module level** so unit tests are deterministic and don't hit the network. Live verification happens in Unit 6.

## Open Questions

### Resolved during planning

- _Where the LLM tool lives:_ MCP server (TypeScript), not agent (Python).
- _Provider:_ NOWBIND default, OpenAI fallback.
- _Model:_ NOWBIND `gpt-4o` (Azure deployment); OpenAI `gpt-4o-mini` for the small-model preference user mentioned.
- _JSON or text:_ JSON for structure, then render to Markdown.

### Deferred to implementation

- _Whether NOWBIND's Azure-proxy URL needs `/v1/` suffix or path-style versioning_ — verify in Unit 6 with a live call.
- _Whether to retry on rate-limit_ — start without retry; if NOWBIND is fine, no retry needed for tonight.

## Implementation Units

- [ ] **Unit 1: env wiring + LLM client factory**

**Goal:** Single helper that returns a configured OpenAI-compatible client based on env, or null when neither provider is configured.

**Files:**
- Modify: `mcp-server/src/config/env.ts` (export new env keys)
- Create: `mcp-server/src/external/llm.ts` (`buildLLMClient()`, `LLMClientConfig`, `LLMNotConfiguredError`)
- Test: `mcp-server/tests/llm.test.ts`

**Approach:** Read NOWBIND_* keys first, fall back to OPENAI_API_KEY. If neither present, return null. Returns `{ client, model, provider }` so callers can log the provider used.

**Test scenarios:**
- Happy path — NOWBIND configured returns a client with the Azure baseURL and the NOWBIND model.
- Happy path — only OPENAI configured returns a client with the default OpenAI baseURL and `OPENAI_DEFAULT_MODEL`.
- Edge case — neither configured returns null.
- Edge case — NOWBIND takes precedence when both configured.

- [ ] **Unit 2: differential_diagnosis tool**

**Goal:** Tool that takes patientId + chiefComplaint, fetches patient summary, calls LLM, returns Markdown with ranked DDx.

**Files:**
- Create: `mcp-server/src/tools/differential-diagnosis.ts`
- Test: `mcp-server/tests/differential-diagnosis.test.ts`

**Approach:**
1. If `buildLLMClient()` returns null, return a clear-instruction Markdown error.
2. Call `patientSummary(client, { patientId })` for grounding context.
3. Construct system prompt: "You are a clinical decision support agent. Given a patient summary and chief complaint, produce a ranked differential diagnosis. Output JSON only matching schema X."
4. Construct user prompt: chief complaint + additional context + patient summary.
5. Call LLM with `response_format: { type: 'json_object' }`, temperature 0.2, max_tokens 1500.
6. Parse JSON, render to Markdown:
   - `# Differential Diagnosis` heading
   - `**Chief Complaint:** ...`
   - `## Ranked Candidates` with each candidate as `### {n}. {Diagnosis} — {Likelihood}` then bullet lists for supporting findings, contradicting findings, recommended next steps.
   - Include the model id and a small disclaimer at the bottom.

**Test scenarios:**
- Happy path — mocked LLM returns 3 candidates JSON; tool renders Markdown with all three.
- Happy path — supporting findings include FHIR resource references that the LLM emitted.
- Error path — LLM not configured returns Markdown explaining how to set env.
- Error path — LLM returns malformed JSON: tool renders a graceful error with the raw output for debugging.
- Edge case — patient with no conditions/observations returns a Markdown that says "Limited grounding data available" and still calls the LLM.

- [ ] **Unit 3: register MCP tool + REST endpoint**

**Goal:** Tool is invokable through both the MCP transport and the REST `/api/differential-diagnosis` route.

**Files:**
- Modify: `mcp-server/src/server.ts` (register tool with input schema)
- Modify: `mcp-server/src/index.ts` (add REST handler)

**Approach:** Mirror the registration pattern of the existing six tools. Input schema requires `patientId` and `chiefComplaint`, optional `additionalContext`.

**Test scenarios:**
- Happy path — `POST /api/differential-diagnosis` with mocked-LLM env returns the same body shape as the other six tools (`{ result, error? }`).
- Edge case — missing `chiefComplaint` returns a 400 with a clear message.

- [ ] **Unit 4: dashboard tool tile**

**Goal:** Dashboard exposes a 7th tool with a chief-complaint textarea + run lifecycle.

**Files:**
- Modify: `frontend/app.js` (tool definition + configure view)
- Modify: `frontend/index.html` (add tool button + configure section)

**Approach:** Add a `differential-diagnosis` tool entry to the tool list, with a `chief-complaint` textarea (required) and an optional `additional-context` text input. Loading copy: "Reasoning over patient findings…". Result renders through the existing markdown renderer — citations from the LLM appear inline since they're already backtick-wrapped.

**Test scenarios:** manual browser walkthrough in Unit 6.

- [ ] **Unit 5: agent A2A discovery confidence check**

**Goal:** Verify the agent's `McpToolset` picks up the new tool without code changes.

**Files:**
- Modify only if discovery requires hint — preferably no code change.

**Approach:** Boot agent + MCP, list tools through the agent's MCP connection (existing test infrastructure or manual probe), confirm `differential_diagnosis` appears.

**Test scenarios:**
- Happy path — agent's tool listing contains the new tool. (Can be a manual log inspection — automated test would require live agent.)

- [ ] **Unit 6: live verification + screenshot + commit**

**Goal:** Run the tool against the polypharmacy hero with a realistic chief complaint, verify rendered output makes clinical sense, screenshot.

**Approach:** Boot MCP. `POST /api/differential-diagnosis` with `{ patientId: "6c4769e4-...", chiefComplaint: "65yo F w/ progressive fatigue, edema, recent weight gain" }`. Inspect the JSON, expect 3-5 candidates that include heart failure / diabetic nephropathy progression / hypothyroidism / anemia (matching her actual record). Walk the dashboard tile.

## System-Wide Impact

- **Interaction graph:** New REST endpoint and MCP tool. Both honor the existing SHARP context — patient ID arrives through the same channels.
- **Error propagation:** LLM not configured → Markdown error string in `result`, not an HTTP error.
- **API surface parity:** The agent's `McpToolset` discovers the tool through `tools/list`. No agent code change required.
- **Unchanged invariants:** All six existing tools, the agent card, the SHARP layer, the test counts on existing suites.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| LLM output is non-deterministic; can't snapshot-test exactly. | Tests mock the LLM client and assert structure, not content. Live verification in Unit 6 confirms reasonability. |
| NOWBIND Azure URL may need a `/v1/` suffix or query param. | Try the env-supplied URL first; if 404, log the response shape and adjust. |
| LLM exceeds token budget on patients with very long histories. | Truncate patient summary to ~3000 chars before sending; document truncation. |
| Cost: 7th tool runs on every demo. | Use NOWBIND (more credits) by default. OpenAI fallback uses `gpt-4o-mini`. Bound max_tokens. |
| Adding a 7th tool changes the dashboard tool count; rail layout was sized for 6. | Verify in Unit 6; rail uses flex-column, so adding a row is free. |

## Sources & References

- Brainstorm: `docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md` (F1).
- OpenAI SDK: standard `openai` npm package.
- NOWBIND endpoint shape: Azure OpenAI `/openai/v1/` (provided by user).
