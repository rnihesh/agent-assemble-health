# Mahesh - A2A Agent + Workflows

## Role
Python A2A agent development using Google ADK, sub-agent orchestration, Prompt Opinion integration.

## Timeline (Weeks 2-7)

### Week 2 - Project Setup & Agent Skeleton (DONE)
- [x] Python project with pyproject.toml (google-adk[a2a], httpx, uvicorn, pydantic)
- [x] Agent card (agent_card.json) with 4 skills
- [x] SHARP context middleware (ASGI)
- [x] Root agent skeleton with McpToolset connection
- [ ] Verify agent starts and serves agent card at /.well-known/agent-card.json
- [ ] Test MCP tool connectivity (root agent -> MCP server)

### Week 3 - Root Agent + Patient Review (DONE)
- [x] Root agent instruction with routing logic
- [x] PatientReviewAgent sub-agent
- [x] Error handling in agent instructions (invalid patient ID, tool failures, no data)
- [ ] Test patient review workflow end-to-end:
  1. Receive "review patient X" query
  2. Call patient_summary, interpret_lab_results, calculate_risk_score, identify_care_gaps
  3. Synthesize into structured clinical report
- [ ] Refine agent instructions based on output quality
- [ ] Handle missing patient ID gracefully

### Week 4 - Medication Safety + Risk Assessment (DONE)
- [x] MedicationSafetyAgent sub-agent
- [x] RiskAssessmentAgent sub-agent
- [x] Error handling sections in all agent instructions
- [ ] Test medication safety workflow:
  1. "Is it safe to add warfarin for patient X?"
  2. Check interactions with current meds
  3. Check allergy cross-reactivity
  4. Report by severity
- [ ] Test risk assessment workflow:
  1. Auto-detect applicable calculators from conditions
  2. Run all applicable scores
  3. Synthesize risk profile
- [ ] Handle edge cases (no conditions, no meds)

### Week 5 - Preventive Care + Orchestration (DONE)
- [x] PreventiveCareAgent sub-agent
- [x] Logging infrastructure (basicConfig with format string)
- [x] MCP health check utility (agent/medassist/utils/health.py)
- [x] Retry utility with exponential backoff (agent/medassist/utils/retry.py)
- [ ] Test preventive care workflow:
  1. Identify overdue screenings by age/sex/conditions
  2. Check vaccination status
  3. Prioritize recommendations
- [ ] Cross-agent orchestration:
  - "Full review" triggers patient_review which calls multiple tools
  - Ambiguous queries get clarification
  - Multi-domain queries route to multiple sub-agents
- [ ] Response formatting and markdown quality

### Week 6 - Prompt Opinion Integration
- [ ] Register agent on Prompt Opinion platform
- [ ] Test agent discovery via agent card
- [ ] Handle SHARP context from Prompt Opinion headers
- [ ] End-to-end testing with Prompt Opinion workspace
- [ ] Test with synthetic patients loaded in workspace

### Week 7 - Polish & Edge Cases
- [ ] Optimize agent instructions for response quality
- [ ] Handle timeouts and MCP server failures gracefully
- [x] Add retry logic for transient errors (retry.py utility created)
- [ ] Test with diverse query phrasings
- [ ] Final response formatting review

## Next Sprint - Improvements
- [ ] Add conversation memory/context persistence across turns
- [ ] Implement agent feedback loop (self-evaluation of response quality)
- [ ] Add confidence scoring to agent responses
- [ ] Multi-turn conversation support (follow-up questions)
- [ ] Agent telemetry and analytics (which tools used, latency)
- [ ] Implement agent-to-agent delegation (specialist consults)
- [ ] Add streaming response support for long analyses
- [ ] Create agent evaluation framework (automated scoring)
- [ ] Integration tests: agent -> MCP -> FHIR end-to-end

## Key Files
```
agent/
├── medassist/main.py                    # Entry point (to_a2a) + logging
├── medassist/config.py                  # Config with API key validation
├── medassist/agents/root_agent.py       # Root orchestrator + error handling
├── medassist/agents/patient_review.py   # Comprehensive review + error handling
├── medassist/agents/medication_safety.py # Drug safety + error handling
├── medassist/agents/risk_assessment.py  # Risk scoring + error handling
├── medassist/agents/preventive_care.py  # Care gaps + error handling
├── medassist/utils/retry.py            # Exponential backoff retry
├── medassist/utils/health.py           # MCP health check
├── medassist/sharp/middleware.py        # SHARP ASGI middleware
└── agent_card.json                      # A2A agent card
```

## Dependencies on Others
- Nihesh: MCP server must be running for agent to call tools (http://localhost:3001/mcp)
- Sushank: Test patient scenarios, Prompt Opinion workspace setup

## Technical Notes
- Agent uses gemini-2.0-flash model via Google ADK
- McpToolset connects to MCP server via StreamableHTTPConnectionParams
- Sub-agents inherit MCP tools from root agent
- SHARP context extracted from HTTP headers and stored in ContextVar
- Run with: `uvicorn medassist.main:app --host 0.0.0.0 --port 8001`
- All 5 agent instruction sets include structured error handling sections

## Agent Routing Logic
| Query Pattern | Routes To |
|--------------|-----------|
| "Review patient X" | patient_review |
| "Check interactions" / "Is drug safe?" | medication_safety |
| "Risk score" / "CHA2DS2-VASc" | risk_assessment |
| "Screenings due" / "Vaccinations" | preventive_care |
| Simple factual questions | Root agent (direct) |
