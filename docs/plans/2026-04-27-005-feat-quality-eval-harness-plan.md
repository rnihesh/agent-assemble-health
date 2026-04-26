---
title: "feat: deterministic quality eval harness producing docs/eval-results.md"
type: feat
status: active
date: 2026-04-27
origin: docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md
---

# feat: deterministic quality eval harness

## Overview

Add a one-command quality benchmark — `npm run eval` — that runs each MCP tool against a clinically rich, deterministic fixture patient and emits `docs/eval-results.md` with measurable claims:

- per-tool p50 / p95 latency over N iterations
- output character length (regression signal for unintended truncation)
- presence of expected output sections per tool (regex-based, cheap)
- citation count + density (citations per 1,000 chars)

Hackathon submissions that include rigor signals — measurable benchmarks, regression tests, latency claims — score higher on Feasibility than entries that ship a working demo without telling judges how they know it works.

## Requirements Trace

- R1. `mcp-server/scripts/eval.ts` runs all eight MCP tools against a single in-memory FHIR fixture (Eleanor Vance, 71F: AFib, T2DM, HTN, CKD-3, on warfarin/metformin/lisinopril, recent Cr 1.8 / HbA1c 8.2 / BP 152/92, penicillin allergy). Fixture exercises every tool's expected sections.
- R2. `npm run eval` invocation regenerates `docs/eval-results.md`. Re-runs in <1 second.
- R3. Output report contains: summary statistics, per-tool table, methodology notes, regenerate instructions.
- R4. Network-bound externals (RxNorm, OpenFDA) are deterministically stubbed so the eval is offline-safe and reproducible.
- R5. `differential_diagnosis` is intentionally excluded from the deterministic eval (depends on a live LLM call); its structure remains covered by `tests/differential-diagnosis.test.ts`.

## Scope Boundaries

- **Not in scope:** clinical-validity validation. Section presence is a structural regression signal, not a "is this clinically correct" assertion.
- **Not in scope:** live FHIR latency measurement. The harness measures the in-memory hot path; demo recording is the latency reference for end-to-end.
- **Not in scope:** LLM evals (latency, accuracy, hallucination rate). Future iteration if there's a credible benchmark patient set.

## Key Technical Decisions

- **Stub global fetch instead of mocking modules.** ES module exports are read-only so reassigning `rxnorm.getRxCUI` at runtime fails with `Cannot assign to read only property`. Replacing `globalThis.fetch` with a no-op handler intercepts every external HTTP call without touching production source.
- **Single rich fixture.** Multiple patients × 8 tools × 5 iterations = 40+ runs of mostly redundant variation. One clinically dense patient hits every code path.
- **5 iterations, p50/p95.** Small N — directional only — but enough to flag big regressions; latency on the hot path is so low that more iterations would just measure event-loop noise.
- **Markdown output, not JSON.** Judges read Markdown; Markdown commits cleanly into the repo and surfaces in PR diffs.

## Implementation Units

- [x] **Unit 1: eval script + report writer.** `mcp-server/scripts/eval.ts` defines the fixture, the cases, and the writer.
- [x] **Unit 2: package.json `npm run eval` script.**
- [x] **Unit 3: stub `globalThis.fetch` so RxNorm + OpenFDA do not require network.**
- [x] **Unit 4: live verify + commit.** Confirmed all 8 tools pass section presence at sub-millisecond p50 against the fixture.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Tool output structure changes (heading text drifts), eval reports false positives. | Section presence list is in the eval source; update alongside the tool change. The eval is intentionally fragile to structural change for that reason. |
| In-memory latency claims are misleading vs production. | Methodology notes flag this explicitly; production latency comes from the FHIR network round-trip. |
| Future LLM-tool eval requires credentials. | Differential diagnosis is excluded; explicitly documented in methodology. |

## Sources & References

- F4 from `docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md`.
