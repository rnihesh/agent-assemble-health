# Nihesh - MCP Server + Infrastructure

## Role
MCP Server development, FHIR integration, external APIs, deployment infrastructure.

## Timeline (Weeks 1-6)

### Week 1 - Project Setup & Bootstrap (DONE)
- [x] Initialize project structure (mcp-server/, agent/, scripts/)
- [x] Express + StreamableHTTP MCP bootstrap (index.ts, server.ts)
- [x] FHIR client with pagination and bearer auth
- [x] FHIR resource type definitions
- [x] SHARP context extraction from _meta
- [x] Environment config loader
- [x] 7 FHIR query modules (patient, conditions, medications, observations, allergies, immunizations, procedures)

### Week 2 - Patient Summary + Lab Interpreter
- [x] Tool 1: patient_summary - multi-section clinical summary
- [x] Tool 3: interpret_lab_results - age/sex-adjusted flagging, trends, derived values (eGFR, anion gap, calculated LDL)
- [x] fhir-helpers utility functions
- [ ] Test against HAPI FHIR public server (http://hapi.fhir.org/baseR4)
- [ ] Write unit tests with mock FHIR bundles

### Week 3 - Drug Interactions
- [x] RxNorm API client (drug name -> RxCUI, interactions)
- [x] OpenFDA API client (drug labels, warnings)
- [x] Tool 2: check_drug_interactions - RxNorm + OpenFDA + built-in matrix
- [ ] Test with real drug pairs (warfarin+aspirin, simvastatin+amlodipine)
- [ ] Validate interaction severity classifications

### Week 4 - Risk Calculator
- [x] Tool 4: calculate_risk_score - all 6 calculators
  - CHA2DS2-VASc (stroke risk in AFib)
  - HEART score (chest pain)
  - Wells DVT and PE
  - ASCVD 10-year risk (Pooled Cohort Equations)
  - CKD-EPI eGFR
- [ ] Validate calculator outputs against known test cases
- [ ] Test with Synthea patient data

### Week 5 - Care Gaps + Guideline Matcher
- [x] Tool 5: identify_care_gaps - USPSTF screenings, CDC immunizations, condition monitoring
- [x] Tool 6: match_clinical_guidelines - ADA, ACC/AHA, GOLD, GINA, KDIGO
- [ ] Verify guideline matching against sample patients
- [ ] Edge case testing (pediatric ages, missing data)

### Week 6 - Testing, Polish, Deployment
- [ ] Comprehensive unit tests (vitest)
- [ ] Integration tests against HAPI FHIR
- [ ] Error handling review and hardening
- [ ] Deploy to Railway or Fly.io
- [ ] Set up ngrok for demo
- [ ] Performance optimization (parallel FHIR fetches)

## Key Files
```
mcp-server/
├── src/index.ts              # Express entrypoint
├── src/server.ts             # Tool registration hub
├── src/config/constants.ts   # Clinical reference data (largest file)
├── src/fhir/client.ts        # FHIR REST client
├── src/tools/*.ts            # 6 clinical tools
└── src/external/*.ts         # RxNorm, OpenFDA clients
```

## Dependencies on Others
- Sushank: Clinical reference data validation (constants.ts), Synthea test data
- Mahesh: MCP tool interface contract (tool names, input/output schemas)

## Notes
- TypeScript compiles clean with strict mode
- All 6 tools implemented with full logic (no TODOs)
- constants.ts contains: 30 labs, 34 drug interactions, 25 USPSTF guidelines, 15 condition guidelines, 6 risk calculators, 12 immunizations
