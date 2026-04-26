---
title: "feat: attach FHIR resource citations to clinical claims"
type: feat
status: active
date: 2026-04-27
origin: docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md
---

# feat: attach FHIR resource citations to clinical claims

## Overview

Every clinical claim emitted by the four data-heavy MCP tools (patient_summary, interpret_lab_results, check_drug_interactions, identify_care_gaps) currently appears as a free-text bullet with no link back to its FHIR provenance. A clinician can't audit "where did this come from"; a judge can't tell whether the agent is grounded or hallucinating. This plan attaches each claim's source FHIR resource ID inline as a mono-formatted reference (e.g., `Condition/abc-123`), which the dashboard already styles with a subtle crimson tint via the existing inline-code rule.

The change is additive — no claim is removed, no tool input contract changes, no new endpoints. Existing tests that match exact line strings will be updated to expect the suffix.

## Problem Frame

Hackathon judging weights Feasibility heavily. Auditability and provenance are first-order feasibility signals in healthcare. Right now MedAssist's tools produce bullets like `- Diabetes mellitus type 2 (disorder) (onset: Jan 9, 1991)` with no path back to the FHIR resource. Adding `\`Condition/abc-123\`` at the end of that line — where `abc-123` is the actual resource ID returned by the FHIR server — gives every claim a verifiable handle.

Origin: F2 in the hackathon-winning-features brainstorm, picked as iteration 2 because (a) it is non-LLM-dependent (no `GOOGLE_API_KEY` needed locally), (b) every tool benefits, (c) it is purely additive.

## Requirements Trace

- R1. Each claim emitted by patient_summary that maps to a FHIR resource carries `\`{ResourceType}/{id}\`` at the end of the line.
- R2. Same for interpret_lab_results (observations), check_drug_interactions (medication requests when patient-mode), identify_care_gaps (immunizations referenced as "given").
- R3. A new helper `formatResourceRef` in `mcp-server/src/utils/fhir-helpers.ts` is the single point of truth for the inline format.
- R4. Tests cover the helper and update at least one snapshot per affected tool.
- R5. No reduction in test count; no behavioral break for the existing six tools.
- R6. Frontend already styles backtick-wrapped tokens; no frontend change is needed for visible polish.

## Scope Boundaries

- Risk-calculator and guideline-matcher are **out of scope this iteration**. Risk-calculator's "variables used" table already labels source as "FHIR" without per-resource references; mapping each variable back to its underlying resource adds noise without much audit value at this resolution. Guideline-matcher operates over a curated knowledge base, not patient resources, so resource IDs would be misleading. Both can get a focused iteration if time remains.
- The dashboard's renderer already tints `inline code` content; no frontend change. **Clickable links** to the FHIR base URL are deferred — they require either embedding `FHIR_BASE_URL` in the tool's Markdown or teaching the renderer to detect `Type/id` patterns. Either choice costs more than it adds tonight.

## Context & Research

### Relevant code

- `mcp-server/src/utils/fhir-helpers.ts` — single source of truth for shared formatting helpers (`getCodeDisplay`, `formatDate`, etc.). New `formatResourceRef` lands here.
- `mcp-server/src/tools/patient-summary.ts` — emits conditions, medications, allergies, observations, immunizations. Six insertion points.
- `mcp-server/src/tools/lab-interpreter.ts` — emits observations with severity flags. One insertion point per observation row.
- `mcp-server/src/tools/drug-interaction.ts` — emits medication requests when patient-mode active.
- `mcp-server/src/tools/care-gap-identifier.ts` — emits gaps. Where a gap is satisfied or recently performed, attach the reference for the immunization or observation that proves it.
- `mcp-server/src/fhir/types.ts` — `Resource` interface already has `id?: string`; no schema change.

### Existing patterns

- Each helper in `fhir-helpers.ts` returns a string ready to splice into Markdown. `formatResourceRef` mirrors this pattern.
- Tools currently use simple template-literal Markdown emission. Append the citation at end-of-line so existing structure remains visually identical.

## Key Technical Decisions

- **Inline format:** `` `Type/id` `` — backtick-wrapped, single token, no extra punctuation. The renderer already styles inline code; this rides that style.
- **Position:** end of line, separated from prior content by a single space. Lines that already end in punctuation keep that punctuation; the citation comes after.
- **Empty-id behavior:** if a resource has no `id` (rare; some FHIR servers omit), `formatResourceRef` returns the empty string. The line stays clean, just uncited.
- **No tool-input flag.** Citations are always on. Reasoning: every audience benefits — a clinician who wants to ignore them sees them as a small mono token at end-of-line; a judge who wants to audit sees the handle. A flag would be feature creep.

## Open Questions

### Resolved during planning

- _Should risk-calculator cite the resources behind each variable?_ Deferred; row-level "Diabetes: true (FHIR)" is sufficient at the calculator's resolution.
- _Should guideline-matcher cite anything?_ No — its claims are from a static knowledge base, not FHIR resources.
- _Should we link to the FHIR base?_ Deferred; the renderer would need an enhancement and `FHIR_BASE_URL` would need to be threaded through the tool. Inline `Type/id` is a 90-percent-of-the-value win without that work.

### Deferred to implementation

- _Whether any test fixtures need updated `id` fields_ — most do; verify per-suite during the loop.

## Implementation Units

- [ ] **Unit 1: `formatResourceRef` helper + tests**

**Goal:** Single source of truth for the inline citation format.

**Requirements:** R3.

**Files:**
- Modify: `mcp-server/src/utils/fhir-helpers.ts`
- Test: `mcp-server/tests/fhir-helpers.test.ts`

**Approach:** Export `formatResourceRef(resource: { resourceType?: string; id?: string }): string` returning `` ` `${resource.resourceType}/${resource.id}` ` `` when both fields present; empty string otherwise. Also export `formatResourceRefParts(resourceType: string, id: string | undefined)` for cases where the resource isn't fully constructed (e.g., callers iterating bundle entries).

**Test scenarios:**
- Happy path — `Condition` resource with id returns `` `Condition/abc` ``.
- Edge case — missing id returns empty string.
- Edge case — missing resourceType returns empty string.
- Edge case — `formatResourceRefParts("Patient", undefined)` returns empty string.

**Verification:** New helper tests pass; full `npm test` count holds or grows.

- [ ] **Unit 2: patient-summary citations**

**Goal:** Conditions, medications, allergies, lab observations, vital observations, immunizations — every emitted line cites its resource.

**Requirements:** R1.

**Files:**
- Modify: `mcp-server/src/tools/patient-summary.ts`
- Test: `mcp-server/tests/` — extend or add a citation-aware snapshot.

**Approach:** Append `formatResourceRef(resource)` to each iteration's emitted line.

**Test scenarios:**
- Happy path — fixture with conditions, meds, allergies, labs, vitals, immunizations renders with all six categories citing.
- Edge case — fixture with a resource missing id renders that line uncited but doesn't fail.

- [ ] **Unit 3: interpret_lab_results citations**

**Goal:** Each lab observation row carries a reference to its `Observation/id`.

**Requirements:** R2.

**Files:**
- Modify: `mcp-server/src/tools/lab-interpreter.ts`
- Test: `mcp-server/tests/lab-interpreter.test.ts`

**Approach:** Append the reference at end of each observation row.

- [ ] **Unit 4: drug-interactions citations (patient-mode only)**

**Goal:** When the tool resolves the medication list from a patient ID, each "Patient currently on …" line cites its `MedicationRequest/id`.

**Requirements:** R2.

**Files:**
- Modify: `mcp-server/src/tools/drug-interaction.ts`
- Test: `mcp-server/tests/drug-interaction.test.ts`

**Approach:** Patient-mode path attaches `MedicationRequest/id` to each medication that came from FHIR. Free-text-mode (user supplies medication strings) is unchanged.

- [ ] **Unit 5: care-gap-identifier citations**

**Goal:** Where a gap is "satisfied" or "last performed" and tied to an actual FHIR resource (immunization or observation), cite it.

**Requirements:** R2.

**Files:**
- Modify: `mcp-server/src/tools/care-gap-identifier.ts`
- Test: `mcp-server/tests/care-gap-identifier.test.ts`

**Approach:** Where the tool emits "Last Performed: <date>" lines that derive from a specific immunization or observation, append the reference.

- [ ] **Unit 6: live verification + commit**

**Goal:** Boot MCP, run each affected tool against the polypharmacy hero (`6c4769e4-...`), confirm citations appear in real output, take a screenshot for the record, commit.

**Requirements:** R5.

**Files:**
- Output: `.tmp-screenshots/` (gitignored) — one screenshot of patient_summary post-citation for the record.

## System-Wide Impact

- **Interaction graph:** None added. Tools still emit Markdown; clients consume it as before.
- **API surface parity:** Frontend renderer already styles inline-code; no work.
- **Unchanged invariants:** Tool input contracts, REST endpoint shapes, MCP `initialize` response, agent card.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Existing tests use exact string matches and break. | Update tests in same iteration; do not silence by loosening assertions. |
| FHIR fixtures lack `id` fields — citation is empty in tests. | Update fixtures so `id` is populated for at least one resource per type, proving the happy-path path. |
| Risk-calculator's row "Source: FHIR" feels under-cited next to others. | Documented as scoped-out; revisit in a separate iteration. |

## Sources & References

- Origin: `docs/brainstorms/2026-04-27-hackathon-winning-features-requirements.md`.
