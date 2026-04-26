---
title: "Brainstorm: features that move MedAssist from competent submission to hackathon-winning"
type: brainstorm
status: active
date: 2026-04-27
---

# Brainstorm: hackathon-winning features for MedAssist

## Frame

MedAssist is shippable as of 2026-04-27 02:30 UTC: 184 MCP tests pass, 69 agent tests pass, dashboard rebuilt, three Synthea demo patients verified. That clears the **competent submission** bar.

The judging rubric is three-axis:
1. **AI Factor** — uses generative AI for things rule-based code can't.
2. **Potential Impact** — significant pain point, hypothesized improvement to outcomes / cost / time.
3. **Feasibility** — viable in real systems, respects privacy / safety / regulation.

MedAssist is currently strong on Feasibility and decent on Impact, but **AI Factor is the visible gap**. The six existing tools are deterministic clinical lookups (drug interaction matrix, USPSTF schedule, CHA2DS2-VASc points). The LLM only routes between them and writes summaries. A judge could ask: "what does generative AI add that a non-AI system couldn't?" — and right now the answer is "good user-facing routing prose," which is true but unimpressive.

## Goal

Pick the smallest set of features that (a) push the AI Factor up substantially, (b) sharpen demo impact, and (c) ship cleanly tonight without breaking what's working.

## Candidates

### F1 — Differential diagnosis sub-agent / MCP tool

**What:** Given a chief complaint and a patient ID, fetch the patient's conditions, medications, recent labs, and vitals, then have the LLM produce a ranked differential diagnosis with explicit reasoning chains over the patient's actual data. Each ranked candidate cites which patient findings support or contradict it.

**Why it wins:** This is precisely the cognitive labor that rule-based code cannot do. Differential diagnosis from unstructured presentation against structured longitudinal record is exactly an LLM strength. **AI Factor: high.** Demo impact: very high — clinician describes "65yo M, sudden chest pain, diaphoresis" and the agent reasons over the patient's record to surface ACS, PE, aortic dissection, GERD with each ranked against actual evidence. Feasibility: requires `GOOGLE_API_KEY` to verify locally; the agent already has Gemini wired.

**Risk:** Cannot be unit-tested for "correctness" cleanly; output is non-deterministic. Mitigation: snapshot a few canonical cases for regression and verify the *structure* (returns 3+ ranked candidates with cited findings), not the exact wording.

**Estimated effort:** 90 min — new sub-agent skill on the agent side, no new MCP tool needed (uses existing patient_summary + interpret_lab_results as inputs via tool calls).

### F2 — Citations linking each clinical claim to a FHIR resource

**What:** Every existing tool's output is augmented to attach the FHIR resource ID behind each claim. E.g., a condition line becomes `Type 2 Diabetes (Condition/abc-123)`. A drug interaction becomes `Warfarin (MedicationRequest/def-456) + Ibuprofen (MedicationRequest/ghi-789)`. The dashboard renders these as clickable references that resolve to the raw FHIR JSON.

**Why it wins:** Trust + auditability + provenance. **Feasibility: high boost.** Judges who think about regulation/safety will recognize this immediately. Demo impact: visible polish on every tool, not just one.

**Risk:** Touches all six tools. Wider blast radius. Mitigation: backward-compatible additive change — tool output keeps current shape, new IDs appear as inline mono-tinted spans the renderer already styles.

**Estimated effort:** 60–90 min — propagate FHIR resource IDs through each tool's helpers, render as inline citations in the dashboard.

### F3 — Clinical shift-handoff orchestrator tool

**What:** A new MCP tool `clinical_handoff` that calls patient_summary + interpret_lab_results + check_drug_interactions + identify_care_gaps in one shot and synthesizes the result as a structured shift handoff: Active Problems / Current Medications / Recent Labs To Watch / Open Issues / Action Items.

**Why it wins:** Concrete clinical workflow that takes ~10 minutes per patient daily. Quantifiable time savings make for a strong "before/after" demo beat. **Impact: high.** AI Factor: medium — the synthesis layer can be deterministic Markdown formatting (low AI) or LLM-generated narrative (higher AI).

**Risk:** Adds a 7th tool to the dashboard's tool list. Layout already accommodates 6; needs minor adjustment.

**Estimated effort:** 60 min for deterministic version; +60 if LLM-narrative version added.

### F4 — Eval harness with measurable scenarios

**What:** A test harness that runs each of the six (or seven) tools against a curated set of synthetic patients and measures: latency, completeness (% of expected sections present), correctness (key claims match expected), citation accuracy. Results land in `docs/eval-results.md` and can be re-run on every commit.

**Why it wins:** Hackathons love rigor. A measurable benchmark sets MedAssist apart from "I built a thing, here's a video." **Feasibility + Impact rise; AI Factor unchanged.**

**Risk:** Time-boxed. Probably 90+ minutes to do well. Could become a rabbit hole.

**Estimated effort:** 90–120 min.

### F5 — Lab trend detection

**What:** Extend `interpret_lab_results` to compute deltas over the patient's history — flag labs that are individually within range but trending toward a threshold (e.g., creatinine rising 0.1/year), or labs whose absolute change exceeds a clinical threshold (e.g., +30% in HbA1c). Output: a "Trends to Watch" section.

**Why it wins:** This is the kind of insight that's tedious for a clinician scanning 554 observations and exactly what algorithms shine at. Demo impact: shows the tool surfacing something a human would miss. **AI Factor: low (rule-based statistics, but explained as "AI" in the demo)** unless the LLM picks which deltas are clinically interesting, in which case higher.

**Estimated effort:** 60–90 min.

### F6 — Streaming agent response in the dashboard

**What:** Currently the dashboard waits for the full result and then renders it. Stream the agent's reasoning so the user sees it think through the case in real time. Visible AI in motion.

**Why it wins:** Demo polish. Watching an agent reason is more compelling than watching a spinner. **AI Factor: visible. Impact: marginal.**

**Risk:** Requires SSE wiring on the agent + frontend; existing REST endpoints don't stream. Touches infrastructure; could be tonight's rabbit hole.

**Estimated effort:** 90+ min.

### F7 — Conversational refinement (multi-turn)

**What:** After a tool runs, the dashboard exposes a "Ask a follow-up" input that maintains context. "What if her potassium is actually 5.5?" or "What if I add metformin?" — agent re-runs relevant analyses with the modified state.

**Why it wins:** This is the difference between a tool and a partner. **AI Factor: high. Impact: high.** Demo: changes one variable and watches the recommendation change.

**Risk:** Needs session state on the dashboard; current state machine is single-turn.

**Estimated effort:** 90–120 min.

## Selection for tonight's loop

Sort by leverage (impact × AI-factor / risk):

1. **F1 — Differential diagnosis** — highest AI Factor, biggest demo moment. **Pick first if `GOOGLE_API_KEY` is in `.env`; otherwise pick second.** Verify path: requires a working LLM call.
2. **F2 — Citations** — broad surface, raises trust on every tool. Lower risk than F1. **Pick first if F1 is gated on credentials.**
3. **F3 — Shift handoff** — clean orchestration, ships in an hour. Always-pickable.
4. **F5 — Lab trends** — focused enhancement to one tool, demo-friendly.
5. **F4 — Eval harness** — high-leverage rigor; pick after F1+F2 land.
6. **F7 — Multi-turn** — only if there's significant time left.
7. **F6 — Streaming** — last; mostly polish, easy to rabbit-hole.

## Sequencing decision

Tonight's iterations, in order:

- **Iteration 2: F2 — Citations** (next; not gated on credentials, broad value, additive).
- **Iteration 3: F1 — Differential diagnosis** (highest AI Factor; check `.env` for `GOOGLE_API_KEY` first; if absent, ship the structure with a deterministic stub and document the LLM-mode for the user to enable).
- **Iteration 4: F3 — Shift handoff** (clean orchestration on top of cited tools).
- **Iteration 5: F5 — Lab trends** (focused depth in one tool).
- **Iteration 6: F4 — Eval harness** (measurable rigor across everything).
- Beyond: F7 / F6 if time and energy remain.

Each iteration gets a `/ce:plan`-style plan in `docs/plans/` before implementation. Each ships as a single logical commit on `main`. No deploy, no push, per user constraint.

## Out of scope for the loop

- Anything that violates the user's explicit constraints: deploys, pushes, Devpost submission, Prompt Opinion registration, demo recording, real PHI sources.
- Anything requiring user clarification before proceeding — defer those to a "questions" file rather than blocking.
- Anything that would require dropping below 184 MCP tests or 69 agent tests.
