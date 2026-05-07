# MedAssist — what you built, what to say, how to record it

Read this before you hit record. It's ~600 words. Five minutes now saves you three re-takes.

---

## What's in this app

### MCP Server — 11 clinical tools (TypeScript, port 3001)

**Rule-based (deterministic, no LLM):**

| Tool | What it does |
|---|---|
| `patient_summary` | Demographics + conditions + meds + allergies + labs + vitals + immunizations, every line cited to a `Condition/<id>` or `MedicationRequest/<id>` |
| `interpret_lab_results` | Age/sex-adjusted reference ranges, Unicode sparkline trends (`▁▂▃▄▅▆▇█`), derived values (eGFR, anion gap), critical-value escalation |
| `check_drug_interactions` | Built-in interaction matrix + RxNorm + OpenFDA + therapeutic duplication + allergy cross-reactivity |
| `calculate_risk_score` | Six validated calculators: CHA2DS2-VASc, HEART, Wells DVT, Wells PE, ASCVD, CKD-EPI 2021 |
| `identify_care_gaps` | USPSTF screenings + CDC immunization schedule + condition-specific monitoring gaps |
| `match_clinical_guidelines` | ADA, ACC/AHA, GOLD, GINA, KDIGO target matching |

**LLM-powered (Gemini on the agent side; Azure OpenAI / OpenAI for the MCP-side tools):**

| Tool | What it does |
|---|---|
| `differential_diagnosis` | Ranked DDx with cited supporting/contradicting findings + next steps. Has **multi-turn refinement** — Refine box lets you push in a new lab value and re-ranks live. |
| `draft_soap_note` | S/O/A/P draft from the chart; `language` param lets you output in Spanish, Hindi, etc. |
| `patient_friendly_summary` | Translates the clinical record to plain language (default 6th-grade); configurable reading level and language |
| `next_best_test` | Given a chief complaint + optional working differential, recommends the test that would maximally narrow the candidate set (Bayesian-flavored) |

**Orchestrator:**

| Tool | What it does |
|---|---|
| `clinical_handoff` | Composes patient_summary + labs + drug interactions + care gaps + auto-selected risk scores into a single shift-handoff doc with a numbered action list |

### A2A Agent — 4 specialist sub-agents (Python + Google ADK, port 8001)

- `patient_review` — comprehensive clinical overview
- `medication_safety` — drug interaction + allergy + duplication evaluation
- `risk_assessment` — auto-selects and explains applicable risk calculators
- `preventive_care` — screening + vaccination recommendations

### Other pieces worth knowing

- **Clinical workbench dashboard** at `http://localhost:3001/app` — not the demo venue, but useful for sanity checks
- **Inline FHIR citations** on every clinical claim, abbreviated to `Condition/…<last8>`, clickable to open the raw resource
- **Demo-day snapshot fallback** — 15 pre-captured fixtures in `frontend/demo-fixtures/` so the dashboard can serve cached responses with a "snapshot" badge if HAPI is rate-limiting during recording
- **PHI guardrail** (`mcp-server/src/auth/phi-guard.ts`) — refuses any FHIR base URL outside the synthetic-data allowlist; opt-out only via `PHI_GUARD=off`
- **SHARP compliance** — canonical `X-Patient-ID` / `X-FHIR-Server-URL` / `X-FHIR-Access-Token` headers, JWT `patient` claim precedence, MCP `initialize` advertises the `ai.promptopinion/fhir-context` extension, A2A agent card has `supportedInterfaces[]` + typed `securitySchemes`

---

## What this app is

MedAssist is a clinical decision support agent you plug into Prompt Opinion. It connects to any FHIR R4 server and gives the clinician eleven evidence-backed answers — from shift handoffs to differential diagnoses — where every AI claim is traceable to a specific chart entry.

The pitch in one sentence: **Healthcare AI is only useful if clinicians can audit it, so MedAssist links every answer back to the FHIR resource that supports it.**

It ships both halves of the Agents Assemble challenge: a full MCP server (the tool layer) and an A2A agent (the orchestration layer), wired together over SHARP-compliant headers.

---

## How to run this app

```bash
# 1. Copy env and fill in keys
cp .env.example .env
# Required:
#   GOOGLE_API_KEY              — agent LLM (gemini-2.5-flash works)
#   NOWBIND_AGENT_OPENAI_API_KEY + NOWBIND_AGENT_OPENAI_BASE_URL
#     OR OPENAI_API_KEY         — LLM-powered MCP tools

# 2. Install everything
./scripts/setup.sh

# 3. Boot both services
./scripts/run-all.sh

# 4. Verify
curl localhost:3001/health   # → 200
curl localhost:8001/health   # → 200
```

Run the test suite if you want confidence before recording:

```bash
npm test --prefix mcp-server          # 245 tests
cd agent && ./venv/bin/pytest         # 69 tests
./scripts/test-a2a-e2e.sh            # live A2A round-trip
```

Full setup details are in `docs/startup.md`.

---

## What to record

The demo lives **inside Prompt Opinion** (not the local dashboard). Target: 2:30–3:00, hard cap at 3:00.

### Three demo patients

| Patient | ID | Why you need them |
|---|---|---|
| Mrs. Renata Considine, 72F | `6c4769e4-beda-5b20-3ba5-67e01c6daf03` | 38 conditions, 37 meds, polypharmacy hero — use for handoff + DDx beats |
| Mr. Sal Pacocha, 67M | `99dd324a-1a4e-f640-ab63-729bfd413be4` | CHA2DS2-VASc 2/9 High, 21 care gaps — use for risk-score beat if needed |
| Mr. Trent Padberg, 50M | `3236e622-25fc-dfc3-70a3-f501faa674eb` | General review, lighter chart |

### Beat by beat

**0:00–0:20 — frame the problem**
Say it plainly: Healthcare AI is unusable if clinicians can't audit it. MedAssist solves that by citing every answer back to the chart. Show the agent registered as an External Agent inside your Prompt Opinion workspace.

**0:20–1:10 — beat 1: shift handoff (Considine)**
Load patient `6c4769e4-...`. Ask: *"Give me the shift handoff for this patient."*

Scroll the response. Point out:
- 22 active conditions each with `Condition/<id>` references
- Current Simvastatin entry linked to its `MedicationRequest/<id>`
- Auto-selected risk-score block at the top
- Numbered action items at the bottom

Your line: *"Clinicians spend about ten minutes per patient on shift handoff. This reads in thirty seconds and every line is auditable."*

**1:10–2:10 — beat 2: differential diagnosis + refinement (Considine)**
Same patient. New prompt: *"72F, progressive fatigue and bilateral lower-extremity edema over six weeks."*

Show the DDx render — five ranked candidates (CHF, CKD progression, nephrotic syndrome, cirrhosis, hypothyroidism). Point to a candidate and show its cited `Condition/<id>` from her record.

Then use the Refine box: *"What if her potassium is actually 5.5?"*

Watch the ranking shift. This is your alive moment — it shows the model is reasoning, not reciting.

**2:10–2:30 — beat 3: standards**
Briefly show two things:
1. The agent card — `supportedInterfaces[]`, FHIR-context extension, typed `securitySchemes`
2. The MCP `initialize` response — `ai.promptopinion/fhir-context` capability declared

Say it once: *"SHARP-compliant on the wire, A2A v1 on the agent card, MCP capability declared on initialize."*

**2:30–2:45 — close**
*"Eleven tools, four LLM-powered, every claim cited, deployable. MedAssist."*

### Things to skip
- The local dashboard's UI polish — the demo is inside Prompt Opinion
- Eval harness numbers — judges who care will find `docs/eval-results.md`
- The internal LLM routing choices — judges care about outputs, not plumbing

---

## Recording checklist

- [ ] `curl localhost:3001/health` returns 200 (or public deployed URL equivalent)
- [ ] `curl localhost:8001/health` returns 200
- [ ] Dashboard status indicator says `Live`, not `Degraded`
- [ ] Run `./scripts/test-a2a-e2e.sh` — confirm Considine and Pacocha return rich data from HAPI today
- [ ] `differential_diagnosis` and `draft_soap_note` are not returning a not-configured error (LLM keys set)
- [ ] Recording resolution is 1080p minimum, on-screen text is legible
- [ ] Final cut is under 3:00
- [ ] `ALLOWED_FHIR_HOSTS` is not overridden to point at a real hospital FHIR — synthetic data only

---

Final state on `main`: 11 tools, 4 sub-agents, 245 MCP tests + 69 agent tests passing, 43 commits.
