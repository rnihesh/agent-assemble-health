# MedAssist Demo Script

## Pre-requisites
1. HAPI FHIR server running with Synthea data loaded (port 8080)
2. MCP server running (`cd mcp-server && npm run dev`) on port 3001
3. A2A agent running (`cd agent && python -m medassist.main`) on port 8001
4. Frontend accessible at http://localhost:3001/app

## Demo Flow

### 1. Patient Summary (Complex Elderly Patient)
- **Patient ID:** Use a loaded Synthea patient ID
- **Tool:** patient_summary
- **What to show:** Demographics, active conditions, medications, recent labs, vitals, immunizations
- **Talking points:**
  - Multi-section structured output from FHIR data
  - Age calculation, BMI derivation
  - Chronological lab trends

### 2. Drug Interaction Check (High-Risk Polypharmacy)
- **Tool:** check_drug_interactions
- **Input medications:** warfarin, ibuprofen, sertraline, tramadol
- **What to show:**
  - HIGH severity: warfarin + ibuprofen (bleeding risk)
  - SSRI + tramadol serotonin syndrome risk
  - Allergy cross-check if patient has allergies
  - Therapeutic duplication detection
- **Talking points:**
  - Local matrix for instant results (no network latency)
  - RxNorm API augmentation for comprehensive coverage
  - OpenFDA label data for boxed warnings
  - Severity-sorted output (HIGH before MODERATE)

### 3. Lab Interpretation (Diabetic Not at Goal)
- **Tool:** interpret_lab_results
- **What to show:**
  - HbA1c 9.1% flagged as HIGH with worsening trend (8.3 -> 8.7 -> 9.1)
  - Glucose 210 mg/dL flagged HIGH
  - Creatinine 1.3 with eGFR calculation
  - Urine ACR 85 mg/g indicating microalbuminuria
- **Talking points:**
  - Age/sex-adjusted reference ranges
  - Trend analysis over multiple results
  - Derived values (eGFR, anion gap, BMI)
  - Clinical significance annotations

### 4. Risk Score Calculation
- **Tool:** calculate_risk_score
- **Calculator:** CHA2DS2-VASc (for AFib patient)
- **What to show:**
  - Auto-extraction of risk factors from conditions
  - Score breakdown with individual point contributions
  - Risk category and guideline recommendation
- **Also show:** CKD-EPI for the patient with elevated creatinine
- **Talking points:**
  - 6 validated clinical calculators
  - Guideline-based action thresholds
  - Patient-specific factor identification

### 5. Care Gap Analysis (Preventive Care)
- **Tool:** identify_care_gaps
- **What to show:**
  - Overdue screenings (mammogram > 2 years ago)
  - Missing vaccinations (no pneumococcal if age >= 65)
  - Condition-specific monitoring gaps
  - Flu vaccine from last year (needs current season)
- **Talking points:**
  - USPSTF grade A/B recommendations
  - CDC/ACIP immunization schedule
  - Condition-specific monitoring (ADA, KDIGO, AHA)

### 6. Clinical Guideline Matching
- **Tool:** match_clinical_guidelines
- **Condition:** diabetes
- **What to show:**
  - ADA Standards of Care recommendations
  - Treatment targets (HbA1c, BP, lipids)
  - Monitoring schedule
  - Medication adjustment guidance
- **Talking points:**
  - 15 condition-specific guideline sets
  - Evidence-graded recommendations
  - Actionable treatment targets

### 7. A2A Agent Integration
- **Show:** Natural language query to the A2A agent
- **Example query:** "Review patient [ID] for medication safety and risk assessment"
- **What to show:**
  - Root agent routing to specialist sub-agents
  - medication_safety agent calling check_drug_interactions
  - risk_assessment agent calling calculate_risk_score
  - Synthesized multi-agent response
- **Talking points:**
  - Google ADK multi-agent orchestration
  - A2A protocol for agent interoperability
  - Specialist agents with focused clinical knowledge
  - MCP tools as the shared clinical data layer

## Key Architecture Points to Highlight
1. **MCP Protocol:** Standard tool interface, any MCP client can use our clinical tools
2. **A2A Protocol:** Agent-to-agent communication for multi-system orchestration
3. **FHIR R4:** Industry-standard healthcare data format
4. **Clinical Safety:** All outputs include disclaimers, evidence grades, source citations
5. **Extensibility:** New tools, agents, or guidelines can be added independently
