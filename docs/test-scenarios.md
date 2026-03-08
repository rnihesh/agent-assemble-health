# MedAssist Test Scenarios & Expected Outcomes

## Test Patient 1: Complex Elderly (James Wilson, 72M)
**File:** `mcp-server/tests/fixtures/fhir-bundles/complex-elderly-patient.json`

### Profile
- 72-year-old male, Chicago IL
- Conditions: AFib, Type 2 DM, CKD stage 3, Hypertension, Heart failure NYHA II
- Medications: Warfarin 5mg, Metformin 1000mg, Lisinopril 20mg, Carvedilol 12.5mg, Furosemide 40mg
- Allergies: Penicillin (high/rash), Sulfa (low/hives)
- Key labs: Creatinine 1.8, HbA1c 8.2%, INR 2.5, BNP 450, K 5.1, Hgb 11.2
- BP 148/88, HR 78

### Expected Tool Outputs

**patient_summary:** Full multi-section summary with all conditions, meds, labs flagged

**check_drug_interactions:**
- Warfarin requires INR monitoring with all co-medications
- Metformin caution with CKD (creatinine 1.8, eGFR likely < 45)
- Potassium 5.1 elevated -- lisinopril + furosemide interaction context

**interpret_lab_results:**
- Creatinine 1.8: HIGH, eGFR calculation ~38 mL/min (CKD stage 3b)
- HbA1c 8.2%: HIGH (target < 7% per ADA)
- BNP 450: HIGH (heart failure monitoring)
- K 5.1: HIGH (risk with ACE inhibitor)
- Hgb 11.2: LOW (anemia of CKD)
- BP 148/88: Stage 2 hypertension

**calculate_risk_score (CHA2DS2-VASc):**
- Age 65-74: 1 point
- Hypertension: 1 point
- Diabetes: 1 point
- Heart failure: 1 point
- Vascular disease (if applicable): 1 point
- Expected score: 4-5 (HIGH risk, anticoagulation recommended)

**calculate_risk_score (CKD-EPI):**
- eGFR ~38 mL/min/1.73m2 (stage 3b)
- Referral to nephrology recommended

**identify_care_gaps:**
- No pneumococcal vaccine on record (recommended age >= 65)
- Colorectal cancer screening status unknown
- Annual eye exam for diabetes unknown
- Annual foot exam for diabetes unknown

---

## Test Patient 2: Chest Pain (Robert Chen, 55M)
**File:** `mcp-server/tests/fixtures/fhir-bundles/chest-pain-patient.json`

### Profile
- 55-year-old male, San Francisco CA
- Conditions: Acute chest pain, Hypertension, Hyperlipidemia, Type 2 DM, Current smoker
- Medications: Atorvastatin 40mg, Lisinopril 10mg, Metformin 500mg, Aspirin 81mg
- Labs: Troponin 0.08 -> 0.15 (rising), Total cholesterol 245, HDL 38, LDL 168, HbA1c 7.8, Glucose 185
- BP 162/95, HR 96, ECG: ST depression V4-V6

### Expected Tool Outputs

**calculate_risk_score (HEART):**
- History: moderately suspicious (1-2 points)
- ECG: non-specific ST changes (1 point)
- Age 45-64: 1 point
- Risk factors: HTN + DM + smoking + hyperlipidemia (>= 3 factors: 2 points)
- Troponin: elevated/rising (2 points)
- Expected HEART score: 7-8 (HIGH risk, cardiology consult, admission)

**calculate_risk_score (ASCVD):**
- Male, 55, total cholesterol 245, HDL 38, systolic 162, on HTN meds, diabetic, smoker
- Expected 10-year risk: > 20% (HIGH)

**interpret_lab_results:**
- Troponin I rising (0.08 -> 0.15): critical flag, possible MI
- LDL 168: HIGH (target < 100 with DM)
- HDL 38: LOW
- Glucose 185: HIGH
- HbA1c 7.8%: above target
- BP 162/95: Stage 2 hypertension

**check_drug_interactions:**
- Current regimen generally safe
- Aspirin + atorvastatin: no significant interaction
- Consider adding anticoagulation -- check interaction with aspirin

---

## Test Patient 3: Drug Safety (Margaret Thompson, 65F)
**File:** `mcp-server/tests/fixtures/fhir-bundles/drug-safety-patient.json`

### Profile
- 65-year-old female, Boston MA
- Conditions: AFib, Osteoarthritis, Major depression, GERD, Hypertension
- Medications: Warfarin 5mg, Ibuprofen 600mg, Sertraline 100mg, Omeprazole 20mg, Amlodipine 5mg, Tramadol 50mg
- Allergies: Penicillin (anaphylaxis), Codeine (respiratory distress)
- Labs: INR 3.8 (supratherapeutic), Hgb 10.8 (low)

### Expected Tool Outputs

**check_drug_interactions -- CRITICAL FINDINGS:**
- HIGH: Warfarin + Ibuprofen -- major bleeding risk (NSAID + anticoagulant)
- HIGH: Sertraline + Tramadol -- serotonin syndrome risk (SSRI + opioid)
- MODERATE: Warfarin + Sertraline -- increased bleeding risk (SSRI potentiates warfarin)
- MODERATE: Warfarin + Omeprazole -- may alter warfarin metabolism
- INR 3.8 already supratherapeutic -- ibuprofen making it worse
- Codeine allergy -- tramadol cross-reactivity concern (both opioids)

**interpret_lab_results:**
- INR 3.8: CRITICALLY HIGH (target 2.0-3.0 for AFib)
- Hgb 10.8: LOW (possible GI bleeding from warfarin + NSAID)
- Needs urgent warfarin dose adjustment and NSAID discontinuation

**calculate_risk_score (CHA2DS2-VASc):**
- Female: 1 point
- Age 65-74: 1 point
- Hypertension: 1 point
- Expected score: 3 (moderate-high, anticoagulation indicated but current regimen dangerous)

---

## Test Patient 4: Preventive Care (Sarah Martinez, 45F)
**File:** `mcp-server/tests/fixtures/fhir-bundles/preventive-care-patient.json`

### Profile
- 45-year-old female, Houston TX
- Conditions: Hypertension, Obesity (BMI 32)
- Medications: Hydrochlorothiazide 25mg
- No drug allergies (NKDA)
- Last mammogram: March 2023 (> 2 years ago)
- Last Pap/HPV: August 2021 (> 4 years ago if co-testing every 5 years, on schedule)
- Last flu vaccine: October 2024 (needs 2025-2026 season)
- Tdap: 2015 (> 10 years, needs booster)

### Expected Tool Outputs

**identify_care_gaps:**
- OVERDUE: Screening mammogram (last March 2023, biennial per USPSTF)
- OVERDUE: Influenza vaccine (last season's, needs current)
- UPCOMING: Tdap booster (2015 + 10 years = due 2025)
- Cervical cancer: Pap+HPV 2021, if co-testing q5yr, next due 2026 (on schedule)
- Colorectal cancer screening: starts at age 45 (USPSTF 2021), may be due
- No diabetes screening documented (risk factors: obesity, HTN)
- Lipid panel status unknown

**patient_summary:**
- BMI 32.3 (88kg / 1.65m)
- BP 132/84 (borderline, on HCTZ)
- Minimal medication burden (good)

**match_clinical_guidelines (hypertension):**
- ACC/AHA target: < 130/80
- Current 132/84: slightly above target
- Consider adding second agent or increasing HCTZ

---

## Test Patient 5: Diabetic Not at Goal (David Kumar, 58M)
**File:** `mcp-server/tests/fixtures/fhir-bundles/diabetic-not-at-goal.json`

### Profile
- 58-year-old male, Seattle WA
- Conditions: Type 2 DM (10 years), HTN, Diabetic neuropathy, Diabetic retinopathy, Hyperlipidemia
- Medications: Metformin 1000mg, Glipizide 10mg, Lisinopril 20mg, Atorvastatin 40mg, Gabapentin 300mg, Aspirin 81mg
- Labs: HbA1c trending UP (8.3 -> 8.7 -> 9.1%), Glucose 210, Creatinine 1.3, Urine ACR 85, LDL 142, HDL 35
- BP 145/90

### Expected Tool Outputs

**interpret_lab_results -- KEY CONCERNS:**
- HbA1c 9.1%: HIGH with worsening trend (3 readings over 6 months)
- Glucose 210: HIGH (fasting target < 130)
- Creatinine 1.3: borderline elevated, eGFR calculation needed
- Urine ACR 85 mg/g: moderately increased albuminuria (stage A2, 30-300)
- LDL 142: HIGH (target < 70 with DM + ASCVD risk factors per ADA)
- HDL 35: LOW
- BP 145/90: above DM target of < 130/80

**match_clinical_guidelines (diabetes):**
- ADA Standards of Care:
  - HbA1c target < 7% (currently 9.1%, far from goal)
  - Consider adding third agent: GLP-1 RA or SGLT2 inhibitor
  - SGLT2i preferred given albuminuria (renal protective)
  - Intensify statin therapy (high-intensity statin for DM age 40-75)
  - BP target < 130/80, needs second antihypertensive

**calculate_risk_score (ASCVD):**
- Male, 58, total cholesterol 225, HDL 35, systolic 145, on HTN meds, diabetic
- Expected 10-year risk: > 15% (high risk)
- Already on statin but LDL not at target

**calculate_risk_score (CKD-EPI):**
- Creatinine 1.3, male, 58
- eGFR likely ~60-65 mL/min (stage 2-3a transition)
- Combined with albuminuria: nephrology referral consideration

**identify_care_gaps:**
- Annual dilated eye exam (has retinopathy -- needs 6-month follow-up)
- Annual foot exam (has neuropathy)
- Annual urine ACR (done, shows progression)
- Consider ASCVD risk assessment for statin intensification
- Pneumococcal vaccine (DM is indication regardless of age)
