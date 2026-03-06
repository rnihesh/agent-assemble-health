# Sushank - Clinical Knowledge + Data + Demo

## Role
Clinical reference data validation, synthetic patient data, Prompt Opinion workspace, demo preparation, marketplace submission.

## Timeline (Weeks 1-8)

### Weeks 1-2 - Clinical Reference Data
- [ ] Review and validate lab reference ranges in:
  - `mcp-server/src/config/constants.ts` (LAB_REFERENCE_RANGES - 30 labs)
  - `agent/medassist/knowledge/lab_reference_ranges.json` (40 labs)
- [ ] Review and validate risk score formulas:
  - CHA2DS2-VASc criteria and point values
  - HEART score criteria
  - Wells DVT/PE criteria
  - ASCVD Pooled Cohort Equations coefficients
  - CKD-EPI 2021 equation
- [ ] Review USPSTF screening guidelines (25 entries) for accuracy
  - Verify age ranges, frequencies, grades
  - Check against current USPSTF website
- [ ] Review drug interaction matrix (34 interactions)
  - Verify severity classifications (HIGH vs MODERATE)
  - Validate mechanisms and clinical effects
  - Add any missing critical interactions
- [ ] Review clinical guidelines (15 conditions)
  - Verify treatment targets (HbA1c, BP, LDL goals)
  - Check first-line medications are current
  - Validate monitoring schedules
- [ ] Review CDC immunization schedule (12 entries)

### Weeks 3-4 - Synthea Data & Test Scenarios
- [ ] Install Synthea (https://github.com/synthetichealth/synthea)
- [ ] Generate 10-20 synthetic patients with diverse profiles:
  - Elderly patient with AFib + diabetes + CKD (tests: CHA2DS2-VASc, care gaps, multiple guidelines)
  - Middle-aged male with chest pain (tests: HEART score, troponin interpretation)
  - Young female for preventive care (tests: screening recommendations, immunizations)
  - Patient on warfarin + NSAIDs (tests: drug interaction detection)
  - Patient with abnormal labs (tests: lab interpretation, critical values)
  - Diabetic patient not at goal (tests: guideline matching, HbA1c targets)
- [ ] Create FHIR test fixture bundles in `mcp-server/tests/fixtures/fhir-bundles/`
- [ ] Load synthetic patients into HAPI FHIR test server
- [ ] Document patient IDs and expected outcomes for each scenario
- [ ] Run `scripts/load-synthea-data.sh` to verify data loading

### Week 5 - Prompt Opinion Workspace
- [ ] Create Prompt Opinion workspace
- [ ] Set up patient records in workspace
- [ ] Configure FHIR endpoint access
- [ ] Upload test documents
- [ ] Verify agent connectivity from Prompt Opinion
- [ ] Test each tool through the platform UI

### Weeks 6-7 - Demo Script & Video
- [ ] Write demo script covering:
  1. **Opening** (15 sec): "MedAssist is a clinical decision support agent..."
  2. **Patient Review** (45 sec): Show comprehensive review of a complex patient
  3. **Drug Interaction** (30 sec): Check safety of adding a new medication
  4. **Risk Assessment** (30 sec): Auto-calculated risk scores
  5. **Care Gaps** (30 sec): Overdue screenings identified
  6. **Architecture** (30 sec): Quick view of MCP + A2A architecture
- [ ] Record demo video (< 3 minutes)
  - Screen recording with voiceover
  - Show real interactions on Prompt Opinion
  - Highlight clinical accuracy
- [ ] Edit and polish video

### Week 8 - Submission
- [ ] Marketplace publishing on Prompt Opinion
- [ ] Final documentation (README.md)
- [ ] Submission checklist:
  - [ ] Agent card accessible at /.well-known/agent-card.json
  - [ ] Agent registered on Prompt Opinion marketplace
  - [ ] Demo video uploaded
  - [ ] All tools working end-to-end
  - [ ] Source code clean and documented

## Key Files to Review/Edit
```
mcp-server/src/config/constants.ts          # All clinical reference data
agent/medassist/knowledge/*.json            # Agent knowledge files
mcp-server/tests/fixtures/fhir-bundles/     # Test data (to create)
```

## Clinical Data Sources for Validation
- USPSTF: https://www.uspreventiveservicestaskforce.org/uspstf/recommendation-topics
- CDC Immunizations: https://www.cdc.gov/vaccines/schedules/hcp/imz/adult.html
- ADA Standards of Care: https://diabetesjournals.org/care
- ACC/AHA Guidelines: https://www.acc.org/guidelines
- KDIGO CKD Guidelines: https://kdigo.org/guidelines/
- GOLD COPD: https://goldcopd.org/
- RxNorm: https://www.nlm.nih.gov/research/umls/rxnorm/
- LOINC: https://loinc.org/

## Demo Scenarios Checklist
| Scenario | Patient Profile | Tools Demonstrated | Status |
|----------|----------------|-------------------|--------|
| Complex elderly | 72M, AFib, DM2, CKD3, HTN | All 6 tools | [ ] |
| Chest pain | 55M, presenting with chest pain | HEART score, troponin, patient summary | [ ] |
| Drug safety | 65F on warfarin, adding NSAID | Drug interactions, allergies | [ ] |
| Preventive care | 45F, healthy, overdue screenings | Care gaps, immunizations | [ ] |
| Guideline review | 58M, DM2 not at HbA1c goal | Guideline matcher, lab interpreter | [ ] |
