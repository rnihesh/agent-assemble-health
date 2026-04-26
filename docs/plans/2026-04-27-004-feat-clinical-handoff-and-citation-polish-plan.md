---
title: "feat: clinical_handoff orchestrator + citation polish + curated scenarios"
type: feat
status: active
date: 2026-04-27
origin: docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md
---

# feat: clinical_handoff orchestrator + citation polish + curated scenarios

## Overview

Three demo-impact polish items in one iteration:

1. **`clinical_handoff` MCP tool** (F3 from the brainstorm). Aggregates the four data-heavy tools plus auto-selected risk scores into a single shift-handoff document with a numbered action list. Time-saving demo claim: clinicians spend ~10 minutes per patient on shift handoff manually; this reads in 30 seconds.
2. **Citation rendering polish.** The 36-character UUID FHIR refs (e.g. `Condition/6c4769e4-beda-5b20-...`) wrapped onto their own line in the dashboard, halving visual density. The renderer now abbreviates display to `Type/…<last8>` while preserving the full id in `title=` for clinician audit.
3. **Curated scenario presets** that load each marquee tool against the verified Synthea demo patients with realistic inputs in one click.

## Problem Frame

After iteration 3 (differential_diagnosis), the AI Factor showcase exists but the demo flow is awkward — judges have to manually type a chief complaint and remember which patient ID has rich data. Polish items here lower friction for the recording window.

## Requirements Trace

- R1. New MCP tool `clinical_handoff(patientId, lookbackDays?, includeRiskScores?)` returns a structured handoff Markdown.
- R2. Tool reuses existing `patientSummary`, `interpretLabResults`, `checkDrugInteractions`, `identifyCareGaps`, and `calculateRiskScore` — no duplication of clinical logic.
- R3. Risk scores are auto-selected based on the patient's condition profile (CHA2DS2-VASc when AFib; ASCVD when cardiac risk factors; CKD-EPI when renal disease).
- R4. New REST endpoint `POST /api/clinical-handoff` and dashboard tile (8th tool).
- R5. Markdown renderer displays `Type/<long-uuid>` references as `Type/…<last 8>` with the full id in `title=` for hover/audit.
- R6. Five curated scenarios in the dashboard's Try-a-scenario menu, including the polypharmacy hero for handoff and differential, the risk-score hero for CHA2DS2-VASc.
- R7. No regression on existing tests; new tests cover the orchestration + the renderer change.

## Scope Boundaries

- The handoff tool's section selection is opinionated (active conditions, current meds, allergies, vitals, abnormal labs only, top-5 gaps, applicable risk scores). Customization knobs are deferred.
- The renderer abbreviation only applies to `Type/<id>` patterns where the id is ≥ 12 chars. Shorter ids render verbatim.
- A2A agent code is not modified — `McpToolset` auto-discovers the new tool.

## Key Technical Decisions

- **Reuse, don't duplicate.** `clinical_handoff` calls the existing tools as functions and stitches their Markdown sections. Section extraction is regex-based on `## ` headings, which is brittle but acceptable for hackathon scope; the tools' output shape is stable in this repo.
- **Auto-selection of risk scores via condition keyword matching.** Mirrors how care-gap-identifier matches conditions to guidelines — keeps the heuristic in one place pattern.
- **Renderer abbreviation is frontend-only.** Tools still emit full ids; no backend churn. Pattern: `^([A-Z][A-Za-z]+)\/([A-Za-z0-9._-]{8,})$` → `Type/…<last 8>`.
- **External network mocked in tests.** Drug-interaction's RxNorm + OpenFDA calls are stubbed via `vi.mock` (matching the pattern in `drug-interaction.test.ts`) so the handoff test stays under 100ms.

## Implementation Units

- [x] **Unit 1: clinical_handoff tool + tests.**
- [x] **Unit 2: register tool + REST endpoint.**
- [x] **Unit 3: dashboard tile + scenario presets (polypharmacy handoff, polypharmacy DDx, risk-score hero).**
- [x] **Unit 4: markdown renderer abbreviates FHIR refs (frontend/app.js inline()).**
- [x] **Unit 5: live verify + commit.**

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Section extraction breaks if a tool changes its `##` heading wording. | Tests in `clinical-handoff.test.ts` exercise the orchestration; any heading drift would surface as a missing section. |
| Renderer abbreviation hides info clinicians need. | Full id preserved in `title=`; `cursor: help` + dotted underline signals the abbreviation is interactive. |
| Risk-score auto-selection picks wrong calculator. | Keyword matching is conservative; falls back to "no risk scores apply" when nothing matches. |

## Sources & References

- F3 from `docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md`.
