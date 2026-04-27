# MedAssist Demo Script

A 2:30–3:00 walkthrough designed for the Agents Assemble submission video. Targets the three-axis judging rubric: AI Factor, Potential Impact, Feasibility.

## Pre-requisites

1. MCP server deployed publicly (Track C). Local dev: `npm run dev --prefix mcp-server`.
2. A2A agent deployed publicly (Track C). Local dev: `cd agent && ./venv/bin/uvicorn medassist.main:app --port 8001`.
3. Agent registered in Prompt Opinion via External Agents UI (Track D, Unit D1).
4. `.env` populated with `NOWBIND_AGENT_OPENAI_API_KEY` + `NOWBIND_AGENT_OPENAI_BASE_URL` (or `OPENAI_API_KEY`) so the LLM-powered tools work.
5. Three Synthea demo patients on HAPI sandbox — see [test-scenarios.md](test-scenarios.md).

## Talking points (the spine of the video)

- **What this is:** a healthcare clinical decision support system built as both an MCP server (nine tools) and an A2A agent (four sub-agents), standards-compliant SHARP context propagation, every clinical claim cited back to a FHIR resource so a clinician can audit the chain.
- **What's surprising:** one of the tools is LLM-powered — `differential_diagnosis` reasons over the patient's longitudinal record against a chief complaint and ranks candidates with cited supporting findings.
- **What's measurable:** 211 backend tests, deterministic eval harness in [eval-results.md](eval-results.md).

## Demo flow (≈ 2:30 total)

### 0:00 — Opening (15s)

> "Healthcare AI is hard because clinical claims have to be auditable. MedAssist is a clinical decision support agent and MCP server where every claim links back to a FHIR resource. I'm running it inside Prompt Opinion right now."

Show: Prompt Opinion workspace with MedAssist registered as an External Agent. Agent card visible — protocol version, four skills (patient_review, medication_safety, risk_assessment, preventive_care), FHIR-context extension declared.

### 0:15 — Marquee beat 1: clinical shift handoff (50s)

Stage patient `6c4769e4-...` (Renata Considine, 72F: T2DM, HTN, post-renal-transplant, 38 conditions). Either invoke the MedAssist agent with a natural-language request ("Give me the shift handoff for this patient") or click the **Try a scenario → Considine handoff** preset in the dashboard.

> "This is a real Synthea patient on the public HAPI sandbox. The shift handoff tool composes five other tools — patient summary, lab interpretation, drug interactions, care gaps, applicable risk scores — into one read."

Scroll the rendered output. Highlight:
- 22 active conditions, each citing a `Condition/<id>` reference
- Current medications with `MedicationRequest/<id>` references
- Auto-selected ASCVD attempted (missing inputs surface explicitly — no hallucinated number)
- 21 USPSTF care gaps
- Action items list at the bottom

> "Clinicians spend ~10 minutes per patient on shift handoff. This reads in 30 seconds and every line is auditable."

### 1:05 — Marquee beat 2: differential diagnosis (the AI Factor) (1:00)

Switch to the **Considine differential** scenario — same patient, new chief complaint preloaded:

> "72F, progressive fatigue and bilateral lower-extremity edema over 6 weeks, recent weight gain of 4 kg."

Click Run. While the spinner shows tool-specific loading copy ("Reasoning over the patient's record against the chief complaint…"):

> "The first six tools were rule-based — drug interaction matrix, USPSTF lookup, validated risk calculators. This one is generative AI. The model reads her FHIR record as grounding context and produces a ranked differential."

When the result renders, scroll through:
- Synthesis paragraph
- Five ranked candidates: CHF (High), CKD progression (Medium), Nephrotic syndrome (Medium), Liver cirrhosis (Low), Hypothyroidism (Low)
- Each candidate's supporting findings include the patient's actual `Condition/<id>` references — the LLM saw the citations in its grounding context and re-cited them
- Each candidate's recommended next steps (BNP, echocardiogram, urine protein, TSH, LFTs)

> "The LLM sees the same FHIR resource references the deterministic tools emit, and re-cites them in its supporting findings. A clinician can audit every candidate against the actual record."

### 2:05 — Standards beat (15s)

Briefly show:
- Agent card v1: `supportedInterfaces[]`, `capabilities.extensions[]` declaring the Prompt Opinion FHIR-context URI
- MCP `initialize` response: `ai.promptopinion/fhir-context` extension with the SMART scopes the tools need
- Three of the canonical SHARP headers (`X-Patient-ID`, `X-FHIR-Server-URL`, `X-FHIR-Access-Token`) flowing on a captured request

> "SHARP-compliant on the wire, A2A v1 on the agent card, MCP capability declared on initialize. Every requirement in the challenge spec, verified live."

### 2:20 — Closing (10s)

> "Nine tools, two LLM-powered, every claim cited, deployable. MedAssist."

End on the Prompt Opinion workspace screen.

## Backup beats (if time / if a tool is the focus)

These don't appear in the 2:30 cut but are ready if you want a longer version:

### Drug interaction check
Tool: `check_drug_interactions` with the polypharmacy hero. Shows: HIGH-severity warfarin + ibuprofen, RxNorm augmentation, allergy cross-check, therapeutic duplication detection.

### Risk-score hero
Patient `99dd324a-...` (Sal Pacocha, 67M). Tool: `calculate_risk_score` with `CHA2DS2-VASc`. Shows: Score 2/9 (High risk), variables-used table with rules-between-rows, DOAC anticoagulation recommendation citing Lip GY 2010 and the 2019 AHA/ACC/HRS guideline.

### SOAP note draft
Same patient, visit reason "3-month diabetes follow-up". Tool: `draft_soap_note`. Shows: four-section SOAP draft (Subjective / Objective / Assessment / Plan) with FHIR citations preserved through the LLM call. "Drafted by the LLM as a starting point — clinician edits before signing."

### Care gaps + clinical guidelines pair
Patient `99dd324a-...` again. Tool: `identify_care_gaps` returns 21 items (overdue colonoscopy, lung cancer LDCT, Hep B/C, tobacco screening). Then `match_clinical_guidelines` for diabetes — ADA targets table.

## Key technical points to keep in the video voice-over

| Beat | Phrase |
|------|--------|
| Citations | "Every clinical claim links back to a FHIR resource id." |
| AI Factor | "Grounded in the actual record, not generic medical knowledge." |
| Standards | "SHARP-compliant, A2A v1, MCP capability declared." |
| Synthetic data only | "Public HAPI Synthea patients — no real PHI ever touches this stack." |
| Submission scope | "Eight rule-based tools, two LLM-powered, an orchestration tool, and a clinical workbench dashboard." |

## Recording checklist

- [ ] Both services healthy (`/health` returns 200 on MCP and agent)
- [ ] Status indicator on the dashboard shows `Live` (not `Degraded`)
- [ ] Three demo patient IDs verified to return rich data on HAPI today (`./scripts/test-a2a-e2e.sh` + curl probes per [test-scenarios.md](test-scenarios.md))
- [ ] LLM credentials set so `differential_diagnosis` and `draft_soap_note` aren't returning the not-configured error
- [ ] Tabs ready: Prompt Opinion workspace, dashboard `/app`, agent card JSON, MCP `tools/list` response
- [ ] Recording at 1080p minimum; on-screen text legible
- [ ] Final cut < 3:00

## What to skip

- The `frontend/` design notes — the video focuses on capabilities, not aesthetics. Let the polish speak for itself on screen.
- Eval harness numbers — they live in [eval-results.md](eval-results.md) for judges who dig in. Mentioning them out loud is wasted seconds.
- The agent's internal LLM choice — judges don't need to know which model routes the conversation. They care about the outputs.
