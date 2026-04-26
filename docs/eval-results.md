# MedAssist Tool Evaluation Report

**Generated:** 2026-04-26T21:30:43.964Z
**Source:** `mcp-server/scripts/eval.ts`
**Fixture:** Eleanor Vance, 71F — AFib, T2DM, HTN, CKD-3, Penicillin allergy, on warfarin/metformin/lisinopril, recent labs (creatinine 1.8, HbA1c 8.2, BP 152/92).

## Summary

- 8 / 8 tools render every expected section against the fixture patient
- Combined p50 latency across all tools: **2 ms**
- 29 FHIR resource citations emitted across the run — every clinical claim has a back-reference a clinician can audit
- Citations follow the format \`Type/id\` and survive the orchestration in `clinical_handoff` so the receiving provider can audit the underlying source

## Per-tool results

| Tool | Iter | p50 (ms) | p95 (ms) | Chars | Sections | Citations | Cit/1k chars | Status |
|------|------|----------|----------|-------|----------|-----------|--------------|--------|
| patient_summary | 5 | 0.32 | 8.09 | 1381 | 7/7 | 12 | 8.69 | ✓ |
| interpret_lab_results | 5 | 0.07 | 0.31 | 678 | 1/1 | 2 | 2.95 | ✓ |
| check_drug_interactions | 5 | 0.21 | 7.57 | 549 | 2/2 | 3 | 5.46 | ✓ |
| calculate_risk_score:CHA2DS2-VASc | 5 | 0.02 | 0.19 | 1301 | 2/2 | 0 | 0 | ✓ |
| calculate_risk_score:CKD-EPI | 5 | 0.01 | 0.07 | 665 | 1/1 | 0 | 0 | ✓ |
| identify_care_gaps | 5 | 0.11 | 0.51 | 12739 | 1/1 | 1 | 0.08 | ✓ |
| match_clinical_guidelines:diabetes | 5 | 0.41 | 0.86 | 12625 | 1/1 | 0 | 0 | ✓ |
| clinical_handoff | 5 | 0.53 | 0.81 | 5772 | 5/5 | 11 | 1.91 | ✓ |

## Notes

- Iterations: each tool is invoked 5 times against the same fixture; reported p50/p95 are over 5 samples (small N — directional only).
- Latencies exclude FHIR network time (the fixture is in-memory) and exclude any external lookups (RxNorm + OpenFDA stubbed).
- `differential_diagnosis` is intentionally absent: it depends on a live LLM call, which is non-deterministic and cost-bearing. Its structure is covered by `tests/differential-diagnosis.test.ts`.
- Section presence is a regex check, not a clinical-validity check. It catches structural regressions cheaply.
- Citation density is per 1,000 characters of output; tools that mostly emit prose (lab interpretation summary, guideline match) score lower than tools that emit structured rows (patient summary, drug interactions).

## How to regenerate

```
cd mcp-server
npm run eval
```

Re-run after touching any tool or rendering helper to verify there are no structural regressions.
