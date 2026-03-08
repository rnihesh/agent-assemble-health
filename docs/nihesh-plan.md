# Nihesh - MCP Server + Infrastructure

## Role
MCP Server development, FHIR integration, external APIs, deployment infrastructure, frontend dashboard.

## Timeline (Weeks 1-6)

### Week 1 - Project Setup & Bootstrap (DONE)
- [x] Initialize project structure (mcp-server/, agent/, scripts/)
- [x] Express + StreamableHTTP MCP bootstrap (index.ts, server.ts)
- [x] FHIR client with pagination and bearer auth
- [x] FHIR resource type definitions
- [x] SHARP context extraction from _meta
- [x] Environment config loader
- [x] 7 FHIR query modules (patient, conditions, medications, observations, allergies, immunizations, procedures)

### Week 2 - Patient Summary + Lab Interpreter (DONE)
- [x] Tool 1: patient_summary - multi-section clinical summary
- [x] Tool 3: interpret_lab_results - age/sex-adjusted flagging, trends, derived values (eGFR, anion gap, calculated LDL)
- [x] fhir-helpers utility functions
- [x] Write unit tests with mock FHIR bundles
- [ ] Test against HAPI FHIR public server (http://hapi.fhir.org/baseR4)

### Week 3 - Drug Interactions (DONE)
- [x] RxNorm API client (drug name -> RxCUI, interactions)
- [x] OpenFDA API client (drug labels, warnings)
- [x] Tool 2: check_drug_interactions - RxNorm + OpenFDA + built-in matrix
- [x] Unit tests for drug interaction detection (local matrix, allergy conflicts, therapeutic duplication, RxNorm/OpenFDA mocks)
- [ ] Test with real drug pairs (warfarin+aspirin, simvastatin+amlodipine)
- [ ] Validate interaction severity classifications

### Week 4 - Risk Calculator (DONE)
- [x] Tool 4: calculate_risk_score - all 6 calculators
  - CHA2DS2-VASc (stroke risk in AFib)
  - HEART score (chest pain)
  - Wells DVT and PE
  - ASCVD 10-year risk (Pooled Cohort Equations)
  - CKD-EPI eGFR
- [x] Unit tests for risk calculators (CHA2DS2-VASc, HEART, ASCVD, CKD-EPI)
- [ ] Validate calculator outputs against known test cases
- [ ] Test with Synthea patient data

### Week 5 - Care Gaps + Guideline Matcher (DONE)
- [x] Tool 5: identify_care_gaps - USPSTF screenings, CDC immunizations, condition monitoring
- [x] Tool 6: match_clinical_guidelines - ADA, ACC/AHA, GOLD, GINA, KDIGO
- [x] Unit tests for care gap identification and guideline matching
- [ ] Verify guideline matching against sample patients
- [ ] Edge case testing (pediatric ages, missing data)

### Week 6 - Testing, Frontend, Polish (IN PROGRESS)
- [x] Comprehensive unit tests (vitest) - 155 tests across 7 test files
- [x] Frontend dashboard (monochrome, single-page) with REST API endpoints
- [x] CORS and static file serving
- [x] REST API wrappers for all 6 tools (POST /api/*)
- [x] Custom markdown renderer in frontend
- [x] FHIR test fixture bundles (5 patient scenarios)
- [ ] Integration tests against HAPI FHIR
- [ ] Deploy to Railway or Fly.io
- [ ] Set up ngrok for demo
- [ ] Performance optimization (parallel FHIR fetches)

## Next Sprint - Improvements
- [ ] Add WebSocket support for streaming tool responses in frontend
- [ ] Implement FHIR Subscription for real-time data updates
- [ ] Add patient search/autocomplete in frontend
- [ ] Caching layer for FHIR queries (reduce repeated fetches)
- [ ] Rate limiting on REST API endpoints
- [ ] Add OpenAPI/Swagger documentation for REST endpoints
- [ ] Structured logging with correlation IDs
- [ ] Health check endpoint with FHIR connectivity test
- [ ] Docker Compose for one-command startup (MCP + FHIR + Agent)

## Key Files
```
mcp-server/
├── src/index.ts              # Express entrypoint + REST API + static serving
├── src/server.ts             # Tool registration hub
├── src/config/constants.ts   # Clinical reference data (largest file)
├── src/fhir/client.ts        # FHIR REST client
├── src/tools/*.ts            # 6 clinical tools
├── src/external/*.ts         # RxNorm, OpenFDA clients
├── tests/                    # 7 test files, 155 tests
│   ├── helpers/mock-fhir.ts  # Test factory functions
│   └── fixtures/fhir-bundles/*.json  # 5 patient scenarios
frontend/
├── index.html                # Dashboard SPA
├── styles.css                # Monochrome design system
└── app.js                    # Client-side IIFE with markdown renderer
```

## Dependencies on Others
- Sushank: Clinical reference data validation (constants.ts), Synthea test data
- Mahesh: MCP tool interface contract (tool names, input/output schemas)

## Notes
- TypeScript compiles clean with strict mode
- All 6 tools implemented with full logic (no TODOs)
- constants.ts contains: 30 labs, 34 drug interactions, 25 USPSTF guidelines, 15 condition guidelines, 6 risk calculators, 12 immunizations
- Frontend is monochrome only (black/white/gray), no emojis
- REST API endpoints mirror MCP tool interfaces for frontend consumption
