// ──────────────────────────────────────────────────────────────────────────────
// MedAssist Clinical Reference Data
// All values are sourced from publicly-available clinical guidelines and are
// intended for decision-support only -- never as a replacement for clinical
// judgement.
// ──────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LAB REFERENCE RANGES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LabReferenceRange {
  name: string;
  unit: string;
  normalRange: { low: number; high: number };
  criticalLow?: number;
  criticalHigh?: number;
  ageSpecific?: { ageMin: number; ageMax: number; low: number; high: number }[];
  sexSpecific?: { sex: "male" | "female"; low: number; high: number }[];
}

export const LAB_REFERENCE_RANGES: Record<string, LabReferenceRange> = {
  // ── CBC ────────────────────────────────────────────────────────────────────
  "6690-2": {
    name: "White Blood Cell Count (WBC)",
    unit: "10*3/uL",
    normalRange: { low: 4.5, high: 11.0 },
    criticalLow: 2.0,
    criticalHigh: 30.0,
  },
  "789-8": {
    name: "Red Blood Cell Count (RBC)",
    unit: "10*6/uL",
    normalRange: { low: 4.2, high: 5.9 },
    criticalLow: 2.5,
    criticalHigh: 7.5,
    sexSpecific: [
      { sex: "male", low: 4.5, high: 5.9 },
      { sex: "female", low: 4.0, high: 5.2 },
    ],
  },
  "718-7": {
    name: "Hemoglobin",
    unit: "g/dL",
    normalRange: { low: 12.0, high: 17.5 },
    criticalLow: 7.0,
    criticalHigh: 20.0,
    sexSpecific: [
      { sex: "male", low: 13.5, high: 17.5 },
      { sex: "female", low: 12.0, high: 16.0 },
    ],
  },
  "4544-3": {
    name: "Hematocrit",
    unit: "%",
    normalRange: { low: 36, high: 52 },
    criticalLow: 20,
    criticalHigh: 60,
    sexSpecific: [
      { sex: "male", low: 38.3, high: 52.0 },
      { sex: "female", low: 35.5, high: 44.9 },
    ],
  },
  "777-3": {
    name: "Platelet Count",
    unit: "10*3/uL",
    normalRange: { low: 150, high: 400 },
    criticalLow: 50,
    criticalHigh: 1000,
  },
  "787-2": {
    name: "Mean Corpuscular Volume (MCV)",
    unit: "fL",
    normalRange: { low: 80, high: 100 },
  },
  "785-6": {
    name: "Mean Corpuscular Hemoglobin (MCH)",
    unit: "pg",
    normalRange: { low: 27, high: 33 },
  },
  "786-4": {
    name: "Mean Corpuscular Hemoglobin Concentration (MCHC)",
    unit: "g/dL",
    normalRange: { low: 32, high: 36 },
  },

  // ── BMP ────────────────────────────────────────────────────────────────────
  "2345-7": {
    name: "Glucose",
    unit: "mg/dL",
    normalRange: { low: 70, high: 100 },
    criticalLow: 40,
    criticalHigh: 500,
  },
  "3094-0": {
    name: "Blood Urea Nitrogen (BUN)",
    unit: "mg/dL",
    normalRange: { low: 7, high: 20 },
    criticalHigh: 100,
  },
  "2160-0": {
    name: "Creatinine",
    unit: "mg/dL",
    normalRange: { low: 0.6, high: 1.2 },
    criticalHigh: 10.0,
    sexSpecific: [
      { sex: "male", low: 0.7, high: 1.3 },
      { sex: "female", low: 0.6, high: 1.1 },
    ],
  },
  "2951-2": {
    name: "Sodium",
    unit: "mEq/L",
    normalRange: { low: 136, high: 145 },
    criticalLow: 120,
    criticalHigh: 160,
  },
  "2823-3": {
    name: "Potassium",
    unit: "mEq/L",
    normalRange: { low: 3.5, high: 5.0 },
    criticalLow: 2.5,
    criticalHigh: 6.5,
  },
  "2075-0": {
    name: "Chloride",
    unit: "mEq/L",
    normalRange: { low: 98, high: 106 },
    criticalLow: 80,
    criticalHigh: 120,
  },
  "2028-9": {
    name: "Carbon Dioxide (CO2)",
    unit: "mEq/L",
    normalRange: { low: 23, high: 29 },
    criticalLow: 10,
    criticalHigh: 40,
  },
  "17861-6": {
    name: "Calcium",
    unit: "mg/dL",
    normalRange: { low: 8.5, high: 10.5 },
    criticalLow: 6.0,
    criticalHigh: 13.0,
  },

  // ── Liver ──────────────────────────────────────────────────────────────────
  "1742-6": {
    name: "Alanine Aminotransferase (ALT)",
    unit: "U/L",
    normalRange: { low: 7, high: 56 },
    criticalHigh: 1000,
  },
  "1920-8": {
    name: "Aspartate Aminotransferase (AST)",
    unit: "U/L",
    normalRange: { low: 10, high: 40 },
    criticalHigh: 1000,
  },
  "6768-6": {
    name: "Alkaline Phosphatase (ALP)",
    unit: "U/L",
    normalRange: { low: 44, high: 147 },
  },
  "1975-2": {
    name: "Bilirubin, Total",
    unit: "mg/dL",
    normalRange: { low: 0.1, high: 1.2 },
    criticalHigh: 15.0,
  },
  "1751-7": {
    name: "Albumin",
    unit: "g/dL",
    normalRange: { low: 3.5, high: 5.5 },
    criticalLow: 1.5,
  },

  // ── Lipids ─────────────────────────────────────────────────────────────────
  "2093-3": {
    name: "Total Cholesterol",
    unit: "mg/dL",
    normalRange: { low: 0, high: 200 },
    criticalHigh: 400,
  },
  "2089-1": {
    name: "Low-Density Lipoprotein (LDL)",
    unit: "mg/dL",
    normalRange: { low: 0, high: 100 },
  },
  "2085-9": {
    name: "High-Density Lipoprotein (HDL)",
    unit: "mg/dL",
    normalRange: { low: 40, high: 200 },
    sexSpecific: [
      { sex: "male", low: 40, high: 200 },
      { sex: "female", low: 50, high: 200 },
    ],
  },
  "2571-8": {
    name: "Triglycerides",
    unit: "mg/dL",
    normalRange: { low: 0, high: 150 },
    criticalHigh: 500,
  },

  // ── Other ──────────────────────────────────────────────────────────────────
  "4548-4": {
    name: "Hemoglobin A1c (HbA1c)",
    unit: "%",
    normalRange: { low: 4.0, high: 5.6 },
    criticalHigh: 15.0,
  },
  "3016-3": {
    name: "Thyroid Stimulating Hormone (TSH)",
    unit: "mIU/L",
    normalRange: { low: 0.4, high: 4.0 },
    criticalLow: 0.01,
    criticalHigh: 50.0,
  },
  "33914-3": {
    name: "Estimated Glomerular Filtration Rate (eGFR)",
    unit: "mL/min/1.73m2",
    normalRange: { low: 90, high: 200 },
  },
  "6301-6": {
    name: "International Normalized Ratio (INR)",
    unit: "INR",
    normalRange: { low: 0.8, high: 1.1 },
    criticalHigh: 5.0,
  },
  "49563-0": {
    name: "Troponin I, High Sensitivity",
    unit: "ng/mL",
    normalRange: { low: 0, high: 0.04 },
    criticalHigh: 0.4,
    sexSpecific: [
      { sex: "male", low: 0, high: 0.04 },
      { sex: "female", low: 0, high: 0.03 },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. RISK SCORE FORMULAS
// ═══════════════════════════════════════════════════════════════════════════════

export interface RiskScoreCriterion {
  name: string;
  points: number;
  description: string;
}

export interface RiskScoreCategory {
  label: string;
  min: number;
  max: number;
  recommendation: string;
}

export interface RiskScoreFormula {
  name: string;
  fullName: string;
  description: string;
  maxScore: number;
  criteria: RiskScoreCriterion[];
  categories: RiskScoreCategory[];
  references: string[];
}

export const RISK_SCORE_FORMULAS: Record<string, RiskScoreFormula> = {
  "CHA2DS2-VASc": {
    name: "CHA2DS2-VASc",
    fullName: "CHA2DS2-VASc Score for Atrial Fibrillation Stroke Risk",
    description:
      "Estimates stroke risk in patients with non-valvular atrial fibrillation to guide anticoagulation therapy decisions.",
    maxScore: 9,
    criteria: [
      { name: "congestive_heart_failure", points: 1, description: "Congestive Heart Failure (or LV dysfunction)" },
      { name: "hypertension", points: 1, description: "Hypertension (or treated hypertension)" },
      { name: "age_75_or_older", points: 2, description: "Age >= 75 years" },
      { name: "diabetes", points: 1, description: "Diabetes Mellitus" },
      { name: "stroke_tia_thromboembolism", points: 2, description: "Prior Stroke, TIA, or Thromboembolism" },
      { name: "vascular_disease", points: 1, description: "Vascular disease (prior MI, PAD, aortic plaque)" },
      { name: "age_65_to_74", points: 1, description: "Age 65-74 years" },
      { name: "sex_female", points: 1, description: "Sex category: Female" },
    ],
    categories: [
      {
        label: "Low",
        min: 0,
        max: 0,
        recommendation: "No anticoagulation therapy recommended. Consider patient preferences.",
      },
      {
        label: "Moderate",
        min: 1,
        max: 1,
        recommendation:
          "Consider anticoagulation or antiplatelet therapy. Oral anticoagulation may be considered, especially in males with a score of 1.",
      },
      {
        label: "High",
        min: 2,
        max: 9,
        recommendation:
          "Oral anticoagulation is recommended. Direct oral anticoagulants (DOACs) are generally preferred over warfarin unless contraindicated (e.g., mechanical heart valve, moderate-severe mitral stenosis).",
      },
    ],
    references: [
      "Lip GY, et al. Chest. 2010;137(2):263-272.",
      "January CT, et al. 2019 AHA/ACC/HRS Focused Update. Circulation. 2019;140(2):e125-e151.",
    ],
  },

  HEART: {
    name: "HEART",
    fullName: "HEART Score for Major Cardiac Events",
    description:
      "Risk stratifies patients presenting to the emergency department with chest pain for major adverse cardiac events (MACE) at 6 weeks.",
    maxScore: 10,
    criteria: [
      { name: "history", points: 2, description: "History: 0 = slightly suspicious, 1 = moderately suspicious, 2 = highly suspicious" },
      { name: "ecg", points: 2, description: "ECG: 0 = normal, 1 = non-specific repolarization abnormality, 2 = significant ST deviation" },
      { name: "age", points: 2, description: "Age: 0 = <45, 1 = 45-64, 2 = >=65" },
      { name: "risk_factors", points: 2, description: "Risk factors (HTN, DM, smoking, hyperlipidemia, obesity, family history): 0 = none, 1 = 1-2, 2 = >=3 or history of atherosclerotic disease" },
      { name: "troponin", points: 2, description: "Troponin: 0 = <= normal limit, 1 = 1-3x normal limit, 2 = >3x normal limit" },
    ],
    categories: [
      {
        label: "Low",
        min: 0,
        max: 3,
        recommendation: "2% risk of MACE at 6 weeks. Consider early discharge with outpatient follow-up.",
      },
      {
        label: "Moderate",
        min: 4,
        max: 6,
        recommendation: "12-16.6% risk of MACE. Admit for observation and further workup (serial troponins, stress testing or coronary CT angiography).",
      },
      {
        label: "High",
        min: 7,
        max: 10,
        recommendation: "50-65% risk of MACE. Admit, early invasive strategy recommended. Cardiology consultation.",
      },
    ],
    references: [
      "Six AJ, et al. Neth Heart J. 2008;16(6):191-196.",
      "Backus BE, et al. Int J Cardiol. 2013;168(3):2153-2158.",
    ],
  },

  "Wells-DVT": {
    name: "Wells-DVT",
    fullName: "Wells Criteria for Deep Vein Thrombosis",
    description:
      "Clinical prediction rule to estimate the pre-test probability of deep vein thrombosis (DVT).",
    maxScore: 9,
    criteria: [
      { name: "active_cancer", points: 1, description: "Active cancer (treatment within 6 months or palliative)" },
      { name: "paralysis_paresis", points: 1, description: "Paralysis, paresis, or recent plaster immobilization of lower extremity" },
      { name: "bedridden_recently", points: 1, description: "Bedridden >3 days or major surgery within 12 weeks requiring general/regional anesthesia" },
      { name: "local_tenderness", points: 1, description: "Localized tenderness along the distribution of the deep venous system" },
      { name: "entire_leg_swollen", points: 1, description: "Entire leg swollen" },
      { name: "calf_swelling_3cm", points: 1, description: "Calf swelling >3 cm compared to asymptomatic side (measured 10 cm below tibial tuberosity)" },
      { name: "pitting_edema", points: 1, description: "Pitting edema confined to the symptomatic leg" },
      { name: "collateral_veins", points: 1, description: "Collateral superficial veins (non-varicose)" },
      { name: "previous_dvt", points: 1, description: "Previously documented DVT" },
      { name: "alternative_diagnosis", points: -2, description: "Alternative diagnosis at least as likely as DVT" },
    ],
    categories: [
      {
        label: "Low/Unlikely",
        min: -2,
        max: 0,
        recommendation: "DVT unlikely (5% prevalence). Check D-dimer; if negative, DVT excluded. If positive, perform ultrasound.",
      },
      {
        label: "Moderate",
        min: 1,
        max: 2,
        recommendation: "Moderate probability (17% prevalence). Check D-dimer; if negative, DVT unlikely. If positive, perform compression ultrasound.",
      },
      {
        label: "High/Likely",
        min: 3,
        max: 9,
        recommendation: "DVT likely (53% prevalence). Perform compression ultrasound. Consider empiric anticoagulation while awaiting results.",
      },
    ],
    references: [
      "Wells PS, et al. N Engl J Med. 2003;349(13):1227-1235.",
      "Wells PS, et al. Lancet. 1997;350(9094):1795-1798.",
    ],
  },

  "Wells-PE": {
    name: "Wells-PE",
    fullName: "Wells Criteria for Pulmonary Embolism",
    description:
      "Clinical prediction rule to estimate the pre-test probability of pulmonary embolism (PE).",
    maxScore: 12.5,
    criteria: [
      { name: "clinical_signs_dvt", points: 3, description: "Clinical signs and symptoms of DVT (leg swelling, tenderness)" },
      { name: "pe_most_likely", points: 3, description: "PE is the most likely diagnosis or equally likely" },
      { name: "heart_rate_gt_100", points: 1.5, description: "Heart rate > 100 bpm" },
      { name: "immobilization_surgery", points: 1.5, description: "Immobilization (>=3 days) or surgery in previous 4 weeks" },
      { name: "previous_dvt_pe", points: 1.5, description: "Previous DVT or PE" },
      { name: "hemoptysis", points: 1, description: "Hemoptysis" },
      { name: "cancer", points: 1, description: "Malignancy (treatment within 6 months or palliative)" },
    ],
    categories: [
      {
        label: "Low/Unlikely",
        min: 0,
        max: 1.99,
        recommendation: "PE unlikely (1.3% prevalence). Check D-dimer (high-sensitivity); if negative, PE excluded.",
      },
      {
        label: "Moderate",
        min: 2,
        max: 6,
        recommendation: "Moderate probability (16.2% prevalence). Check D-dimer; if positive, perform CT pulmonary angiography (CTPA).",
      },
      {
        label: "High/Likely",
        min: 6.01,
        max: 12.5,
        recommendation: "PE likely (37.5% prevalence). Proceed directly to CTPA. Consider empiric anticoagulation while awaiting imaging.",
      },
    ],
    references: [
      "Wells PS, et al. Thromb Haemost. 2000;83(3):416-420.",
      "van Belle A, et al. JAMA. 2006;295(2):172-179.",
    ],
  },

  ASCVD: {
    name: "ASCVD",
    fullName: "Atherosclerotic Cardiovascular Disease 10-Year Risk (Pooled Cohort Equations)",
    description:
      "Estimates 10-year risk of a first atherosclerotic cardiovascular event (coronary death, nonfatal MI, fatal or nonfatal stroke) using the Pooled Cohort Equations for adults aged 40-79.",
    maxScore: 100,
    criteria: [
      { name: "age", points: 0, description: "Age in years (40-79)" },
      { name: "sex", points: 0, description: "Sex (male or female)" },
      { name: "race", points: 0, description: "Race (White, African American, Other)" },
      { name: "total_cholesterol", points: 0, description: "Total cholesterol (mg/dL)" },
      { name: "hdl_cholesterol", points: 0, description: "HDL cholesterol (mg/dL)" },
      { name: "systolic_bp", points: 0, description: "Systolic blood pressure (mmHg)" },
      { name: "bp_treatment", points: 0, description: "Currently on blood pressure treatment" },
      { name: "diabetes", points: 0, description: "Diabetes mellitus" },
      { name: "smoker", points: 0, description: "Current smoker" },
    ],
    categories: [
      {
        label: "Low",
        min: 0,
        max: 4.99,
        recommendation: "Low 10-year ASCVD risk (<5%). Emphasize lifestyle modifications. Statin therapy generally not indicated based on risk alone.",
      },
      {
        label: "Borderline",
        min: 5,
        max: 7.49,
        recommendation: "Borderline risk (5-7.5%). Consider risk-enhancing factors. If risk-enhancing factors present, moderate-intensity statin may be reasonable.",
      },
      {
        label: "Intermediate",
        min: 7.5,
        max: 19.99,
        recommendation: "Intermediate risk (7.5-20%). Consider coronary artery calcium (CAC) scoring for further risk stratification. If CAC >0, moderate-to-high intensity statin recommended.",
      },
      {
        label: "High",
        min: 20,
        max: 100,
        recommendation: "High risk (>=20%). High-intensity statin therapy recommended. Consider adding ezetimibe if LDL remains >=70 mg/dL.",
      },
    ],
    references: [
      "Goff DC Jr, et al. Circulation. 2014;129(25 Suppl 2):S49-S73.",
      "Grundy SM, et al. 2018 AHA/ACC Cholesterol Guideline. Circulation. 2019;139(25):e1082-e1143.",
    ],
  },

  "CKD-EPI": {
    name: "CKD-EPI",
    fullName: "CKD-EPI Creatinine Equation (2021)",
    description:
      "Estimates glomerular filtration rate (GFR) from serum creatinine. The 2021 CKD-EPI equation does not include a race variable.",
    maxScore: 200,
    criteria: [
      { name: "creatinine", points: 0, description: "Serum creatinine (mg/dL)" },
      { name: "age", points: 0, description: "Age in years" },
      { name: "sex", points: 0, description: "Sex (male or female)" },
    ],
    categories: [
      {
        label: "G1 - Normal or High",
        min: 90,
        max: 200,
        recommendation: "eGFR >= 90 mL/min/1.73m2. Normal kidney function. Monitor if risk factors present.",
      },
      {
        label: "G2 - Mildly Decreased",
        min: 60,
        max: 89,
        recommendation: "eGFR 60-89 mL/min/1.73m2. Mildly decreased. Monitor annually. Assess for CKD risk factors.",
      },
      {
        label: "G3a - Mild to Moderate",
        min: 45,
        max: 59,
        recommendation: "eGFR 45-59 mL/min/1.73m2. Monitor every 6 months. Refer to nephrology if progressing. Adjust renally-cleared medications.",
      },
      {
        label: "G3b - Moderate to Severe",
        min: 30,
        max: 44,
        recommendation: "eGFR 30-44 mL/min/1.73m2. Monitor every 3-6 months. Nephrology referral recommended. Evaluate for complications (anemia, bone disease, acidosis).",
      },
      {
        label: "G4 - Severely Decreased",
        min: 15,
        max: 29,
        recommendation: "eGFR 15-29 mL/min/1.73m2. Nephrology co-management required. Prepare for renal replacement therapy. Monitor every 1-3 months.",
      },
      {
        label: "G5 - Kidney Failure",
        min: 0,
        max: 14,
        recommendation: "eGFR <15 mL/min/1.73m2. Kidney failure. Initiate dialysis planning or transplant evaluation if not already started.",
      },
    ],
    references: [
      "Inker LA, et al. N Engl J Med. 2021;385(19):1737-1749.",
      "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD.",
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. USPSTF SCREENING GUIDELINES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ScreeningGuideline {
  id: string;
  condition: string;
  recommendation: string;
  grade: "A" | "B" | "C" | "D" | "I";
  ageRange: { min: number; max: number };
  sexApplicable: "all" | "male" | "female";
  frequency: string;
  conditionSpecific?: string;
}

export const USPSTF_GUIDELINES: ScreeningGuideline[] = [
  {
    id: "breast-cancer-mammography",
    condition: "Breast Cancer",
    recommendation: "Screen with mammography biennially.",
    grade: "B",
    ageRange: { min: 40, max: 74 },
    sexApplicable: "female",
    frequency: "Every 2 years",
  },
  {
    id: "cervical-cancer",
    condition: "Cervical Cancer",
    recommendation: "Screen with cervical cytology (Pap smear) every 3 years or hrHPV testing every 5 years or co-testing every 5 years.",
    grade: "A",
    ageRange: { min: 21, max: 65 },
    sexApplicable: "female",
    frequency: "Every 3 years (cytology) or every 5 years (hrHPV or co-testing)",
  },
  {
    id: "colorectal-cancer",
    condition: "Colorectal Cancer",
    recommendation: "Screen for colorectal cancer using stool-based tests, colonoscopy, or other approved methods.",
    grade: "A",
    ageRange: { min: 45, max: 75 },
    sexApplicable: "all",
    frequency: "Colonoscopy every 10 years, or FIT annually, or FIT-DNA every 1-3 years",
  },
  {
    id: "lung-cancer",
    condition: "Lung Cancer",
    recommendation: "Screen with annual low-dose computed tomography (LDCT) in adults with a 20 pack-year smoking history who currently smoke or have quit within the past 15 years.",
    grade: "B",
    ageRange: { min: 50, max: 80 },
    sexApplicable: "all",
    frequency: "Annually",
    conditionSpecific: "20+ pack-year smoking history, currently smoking or quit within 15 years",
  },
  {
    id: "diabetes-screening",
    condition: "Prediabetes and Type 2 Diabetes",
    recommendation: "Screen for prediabetes and type 2 diabetes in adults aged 35-70 who have overweight or obesity.",
    grade: "B",
    ageRange: { min: 35, max: 70 },
    sexApplicable: "all",
    frequency: "Every 3 years",
    conditionSpecific: "Overweight or obese (BMI >= 25 kg/m2)",
  },
  {
    id: "hypertension-screening",
    condition: "Hypertension",
    recommendation: "Screen for hypertension in adults 18 years or older. Obtain measurements outside of the clinical setting for diagnostic confirmation.",
    grade: "A",
    ageRange: { min: 18, max: 120 },
    sexApplicable: "all",
    frequency: "Annually",
  },
  {
    id: "lipid-disorders",
    condition: "Lipid Disorders / Dyslipidemia",
    recommendation: "Screen for lipid disorders in adults aged 40-75 as part of cardiovascular risk assessment. Younger adults with risk factors should also be screened.",
    grade: "B",
    ageRange: { min: 40, max: 75 },
    sexApplicable: "all",
    frequency: "Every 5 years (more frequently if risk factors present)",
  },
  {
    id: "osteoporosis-screening",
    condition: "Osteoporosis",
    recommendation: "Screen for osteoporosis with bone measurement testing (DEXA) to prevent osteoporotic fractures in postmenopausal women aged 65 and older, and in younger postmenopausal women with increased fracture risk.",
    grade: "B",
    ageRange: { min: 65, max: 120 },
    sexApplicable: "female",
    frequency: "At least once; repeat based on initial results and risk",
  },
  {
    id: "depression-screening",
    condition: "Depression",
    recommendation: "Screen for major depressive disorder (MDD) in the general adult population, including pregnant and postpartum persons. Screening should be implemented with adequate systems in place to ensure accurate diagnosis, effective treatment, and appropriate follow-up.",
    grade: "B",
    ageRange: { min: 18, max: 120 },
    sexApplicable: "all",
    frequency: "Annually or as clinically indicated",
  },
  {
    id: "aaa-screening",
    condition: "Abdominal Aortic Aneurysm",
    recommendation: "Perform one-time screening for AAA with ultrasonography in men aged 65-75 who have ever smoked.",
    grade: "B",
    ageRange: { min: 65, max: 75 },
    sexApplicable: "male",
    frequency: "One-time screening",
    conditionSpecific: "Men who have ever smoked",
  },
  {
    id: "hepatitis-b-screening",
    condition: "Hepatitis B Virus Infection",
    recommendation: "Screen for hepatitis B virus (HBV) infection in adolescents and adults at increased risk for infection.",
    grade: "B",
    ageRange: { min: 18, max: 120 },
    sexApplicable: "all",
    frequency: "One-time screening; periodic if ongoing risk",
    conditionSpecific: "Persons at increased risk for HBV infection",
  },
  {
    id: "hepatitis-c-screening",
    condition: "Hepatitis C Virus Infection",
    recommendation: "Screen for hepatitis C virus (HCV) infection in adults aged 18-79 years.",
    grade: "B",
    ageRange: { min: 18, max: 79 },
    sexApplicable: "all",
    frequency: "One-time screening; periodic if ongoing risk",
  },
  {
    id: "hiv-screening",
    condition: "HIV Infection",
    recommendation: "Screen for HIV infection in adolescents and adults aged 15-65. Younger and older persons who are at increased risk should also be screened.",
    grade: "A",
    ageRange: { min: 15, max: 65 },
    sexApplicable: "all",
    frequency: "At least once; more frequently for those at increased risk",
  },
  {
    id: "sti-screening",
    condition: "Sexually Transmitted Infections (Chlamydia and Gonorrhea)",
    recommendation: "Screen for chlamydia and gonorrhea in sexually active women aged 24 and younger and in older women at increased risk.",
    grade: "B",
    ageRange: { min: 18, max: 24 },
    sexApplicable: "female",
    frequency: "Annually",
  },
  {
    id: "obesity-screening",
    condition: "Obesity",
    recommendation: "Screen all adults for obesity. Offer or refer patients with a BMI >= 30 kg/m2 to intensive, multicomponent behavioral interventions.",
    grade: "B",
    ageRange: { min: 18, max: 120 },
    sexApplicable: "all",
    frequency: "Annually (BMI measurement)",
  },
  {
    id: "alcohol-misuse-screening",
    condition: "Unhealthy Alcohol Use",
    recommendation: "Screen for unhealthy alcohol use in adults 18 years and older. Provide brief behavioral counseling interventions to persons engaged in risky or hazardous drinking.",
    grade: "B",
    ageRange: { min: 18, max: 120 },
    sexApplicable: "all",
    frequency: "Annually",
  },
  {
    id: "tobacco-use-screening",
    condition: "Tobacco Use",
    recommendation: "Ask all adults about tobacco use, advise them to stop using tobacco, and provide behavioral interventions and FDA-approved pharmacotherapy for cessation.",
    grade: "A",
    ageRange: { min: 18, max: 120 },
    sexApplicable: "all",
    frequency: "At every clinical visit",
  },
  {
    id: "vision-screening",
    condition: "Impaired Visual Acuity in Older Adults",
    recommendation: "Insufficient evidence to assess the balance of benefits and harms of screening for impaired visual acuity in older adults. However, regular eye exams are widely recommended in clinical practice.",
    grade: "I",
    ageRange: { min: 65, max: 120 },
    sexApplicable: "all",
    frequency: "Every 1-2 years",
  },
  {
    id: "hearing-screening",
    condition: "Hearing Loss in Older Adults",
    recommendation: "Insufficient evidence to assess the balance of benefits and harms of screening for hearing loss in asymptomatic older adults.",
    grade: "I",
    ageRange: { min: 50, max: 120 },
    sexApplicable: "all",
    frequency: "As clinically indicated",
  },
  {
    id: "fall-prevention",
    condition: "Falls in Older Adults",
    recommendation: "Exercise interventions are recommended to prevent falls in community-dwelling adults 65 years and older who are at increased risk.",
    grade: "B",
    ageRange: { min: 65, max: 120 },
    sexApplicable: "all",
    frequency: "Ongoing / annually assess fall risk",
  },
  {
    id: "aspirin-cvd-prevention",
    condition: "Cardiovascular Disease Prevention with Aspirin",
    recommendation: "Initiating low-dose aspirin for primary prevention of CVD in adults aged 40-59 with >= 10% 10-year ASCVD risk should be an individual decision. Do not initiate in adults 60+.",
    grade: "C",
    ageRange: { min: 40, max: 59 },
    sexApplicable: "all",
    frequency: "Individual decision; reassess periodically",
    conditionSpecific: "10-year ASCVD risk >= 10%",
  },
  {
    id: "skin-cancer-counseling",
    condition: "Skin Cancer Prevention",
    recommendation: "Counsel young adults, adolescents, children, and parents of young children (aged 6 months to 24 years) with fair skin about minimizing UV radiation exposure to reduce skin cancer risk.",
    grade: "B",
    ageRange: { min: 6, max: 24 },
    sexApplicable: "all",
    frequency: "As clinically appropriate",
  },
  {
    id: "prostate-cancer-screening",
    condition: "Prostate Cancer",
    recommendation: "For men aged 55-69, the decision to undergo PSA-based screening should be an individual one after shared decision-making with their clinician.",
    grade: "C",
    ageRange: { min: 55, max: 69 },
    sexApplicable: "male",
    frequency: "Every 2-4 years if elected",
  },
  {
    id: "anxiety-screening",
    condition: "Anxiety Disorders",
    recommendation: "Screen for anxiety disorders in adults, including pregnant and postpartum persons.",
    grade: "B",
    ageRange: { min: 18, max: 64 },
    sexApplicable: "all",
    frequency: "Periodically; at least once",
  },
  {
    id: "prediabetes-lifestyle",
    condition: "Prediabetes - Lifestyle Intervention",
    recommendation: "Offer or refer adults with prediabetes to effective preventive interventions to prevent progression to type 2 diabetes.",
    grade: "B",
    ageRange: { min: 35, max: 70 },
    sexApplicable: "all",
    frequency: "Ongoing once identified",
    conditionSpecific: "Diagnosed prediabetes",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CDC IMMUNIZATION SCHEDULE (Adults)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ImmunizationScheduleEntry {
  vaccine: string;
  ageRange: { min: number; max: number };
  frequency: string;
  conditions?: string;
  catchUp?: boolean;
}

export const CDC_IMMUNIZATION_SCHEDULE: ImmunizationScheduleEntry[] = [
  {
    vaccine: "Influenza (IIV4 or LAIV4)",
    ageRange: { min: 18, max: 120 },
    frequency: "Annually",
  },
  {
    vaccine: "Td/Tdap (Tetanus, Diphtheria, Pertussis)",
    ageRange: { min: 18, max: 120 },
    frequency: "Tdap once (if not previously received), then Td or Tdap booster every 10 years",
  },
  {
    vaccine: "Zoster Recombinant (Shingrix)",
    ageRange: { min: 50, max: 120 },
    frequency: "2-dose series",
  },
  {
    vaccine: "Pneumococcal (PCV20 or PCV15+PPSV23)",
    ageRange: { min: 65, max: 120 },
    frequency: "1 dose PCV20, or 1 dose PCV15 followed by PPSV23",
    conditions: "Also recommended for adults 19-64 with certain risk conditions",
  },
  {
    vaccine: "Hepatitis B (HepB)",
    ageRange: { min: 19, max: 59 },
    frequency: "2- or 3-dose series depending on vaccine",
    catchUp: true,
  },
  {
    vaccine: "MMR (Measles, Mumps, Rubella)",
    ageRange: { min: 18, max: 120 },
    frequency: "1 or 2 doses depending on indication if no evidence of immunity",
    catchUp: true,
    conditions: "Born in 1957 or later without evidence of immunity",
  },
  {
    vaccine: "Varicella",
    ageRange: { min: 18, max: 120 },
    frequency: "2-dose series if no evidence of immunity",
    catchUp: true,
    conditions: "No evidence of immunity (no prior vaccination or disease)",
  },
  {
    vaccine: "HPV (Human Papillomavirus)",
    ageRange: { min: 18, max: 26 },
    frequency: "2- or 3-dose series depending on age at initial vaccination",
    catchUp: true,
    conditions: "Catch-up through age 26; shared clinical decision-making for ages 27-45",
  },
  {
    vaccine: "COVID-19",
    ageRange: { min: 18, max: 120 },
    frequency: "Updated vaccine annually recommended for all adults",
  },
  {
    vaccine: "Hepatitis A (HepA)",
    ageRange: { min: 18, max: 120 },
    frequency: "2- or 3-dose series depending on vaccine",
    conditions: "Risk-based: travelers, chronic liver disease, homelessness, MSM, drug users, occupational risk",
  },
  {
    vaccine: "Meningococcal ACWY (MenACWY)",
    ageRange: { min: 18, max: 120 },
    frequency: "1 or more doses",
    conditions: "Risk-based: asplenia, complement deficiency, HIV, travel to endemic areas, military recruits, college freshmen in dorms",
  },
  {
    vaccine: "Meningococcal B (MenB)",
    ageRange: { min: 16, max: 23 },
    frequency: "2- or 3-dose series depending on vaccine",
    conditions: "Shared clinical decision-making for ages 16-23; risk-based for asplenia, complement deficiency",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DRUG INTERACTION MATRIX
// ═══════════════════════════════════════════════════════════════════════════════

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: "HIGH" | "MODERATE";
  mechanism: string;
  clinicalEffect: string;
  recommendation: string;
}

export const DRUG_INTERACTION_MATRIX: DrugInteraction[] = [
  {
    drug1: "warfarin",
    drug2: "ibuprofen",
    severity: "HIGH",
    mechanism: "NSAIDs inhibit platelet function and can cause GI erosion; combined with warfarin's anticoagulant effect.",
    clinicalEffect: "Significantly increased risk of GI bleeding and hemorrhage.",
    recommendation: "Avoid combination if possible. If NSAID required, use lowest dose for shortest duration, add PPI, and monitor INR closely.",
  },
  {
    drug1: "warfarin",
    drug2: "naproxen",
    severity: "HIGH",
    mechanism: "NSAIDs inhibit platelet function and can cause GI mucosal damage.",
    clinicalEffect: "Increased risk of GI and other bleeding.",
    recommendation: "Avoid if possible. Use acetaminophen for pain. If NSAID necessary, add GI prophylaxis and increase INR monitoring.",
  },
  {
    drug1: "warfarin",
    drug2: "aspirin",
    severity: "HIGH",
    mechanism: "Aspirin irreversibly inhibits platelet cyclooxygenase; additive anticoagulant/antiplatelet effect.",
    clinicalEffect: "Increased bleeding risk, particularly GI hemorrhage.",
    recommendation: "Avoid unless there is a clear indication (e.g., mechanical valve, recent ACS). If combined, use low-dose aspirin (81 mg) and add PPI.",
  },
  {
    drug1: "warfarin",
    drug2: "ciprofloxacin",
    severity: "HIGH",
    mechanism: "Fluoroquinolones inhibit CYP1A2 and CYP3A4, reducing warfarin metabolism.",
    clinicalEffect: "Increased INR and risk of bleeding.",
    recommendation: "Monitor INR closely within 3-5 days of starting ciprofloxacin. Consider dose reduction of warfarin. Use alternative antibiotic if possible.",
  },
  {
    drug1: "warfarin",
    drug2: "levofloxacin",
    severity: "HIGH",
    mechanism: "Fluoroquinolones may displace warfarin from protein binding and inhibit hepatic metabolism.",
    clinicalEffect: "Elevated INR and increased bleeding risk.",
    recommendation: "Monitor INR frequently. Consider alternative antibiotic. Reduce warfarin dose if INR rises.",
  },
  {
    drug1: "warfarin",
    drug2: "metronidazole",
    severity: "HIGH",
    mechanism: "Metronidazole inhibits CYP2C9, the primary enzyme metabolizing S-warfarin.",
    clinicalEffect: "Markedly elevated INR and risk of hemorrhage.",
    recommendation: "Reduce warfarin dose by 25-50% when starting metronidazole. Monitor INR every 2-3 days.",
  },
  {
    drug1: "fluoxetine",
    drug2: "phenelzine",
    severity: "HIGH",
    mechanism: "SSRIs combined with MAOIs cause excessive serotonin accumulation in CNS synapses.",
    clinicalEffect: "Serotonin syndrome: hyperthermia, rigidity, myoclonus, autonomic instability, potentially fatal.",
    recommendation: "CONTRAINDICATED. Allow at least 5 weeks washout after fluoxetine before starting MAOI (2 weeks for other SSRIs). Allow 2 weeks after MAOI before starting SSRI.",
  },
  {
    drug1: "sertraline",
    drug2: "tranylcypromine",
    severity: "HIGH",
    mechanism: "SSRIs combined with MAOIs cause dangerous serotonin excess.",
    clinicalEffect: "Serotonin syndrome: potentially life-threatening hyperthermia, rigidity, and autonomic dysfunction.",
    recommendation: "CONTRAINDICATED. At least 14-day washout between SSRI discontinuation and MAOI initiation (and vice versa).",
  },
  {
    drug1: "sumatriptan",
    drug2: "fluoxetine",
    severity: "MODERATE",
    mechanism: "Triptans are serotonin 5-HT1B/1D agonists; combined with SSRIs may increase serotonergic activity.",
    clinicalEffect: "Potential risk of serotonin syndrome, though risk is low in clinical practice.",
    recommendation: "Use with caution. Educate patient about serotonin syndrome symptoms. Monitor closely at initiation and dose changes.",
  },
  {
    drug1: "sumatriptan",
    drug2: "sertraline",
    severity: "MODERATE",
    mechanism: "Additive serotonergic effects from triptan + SSRI combination.",
    clinicalEffect: "Theoretical risk of serotonin syndrome.",
    recommendation: "Can generally be used together with monitoring. FDA advisory recommends caution. Counsel patient on warning signs.",
  },
  {
    drug1: "methotrexate",
    drug2: "ibuprofen",
    severity: "HIGH",
    mechanism: "NSAIDs decrease renal clearance of methotrexate and may displace it from protein binding.",
    clinicalEffect: "Methotrexate toxicity: pancytopenia, mucositis, hepatotoxicity, nephrotoxicity.",
    recommendation: "Avoid NSAIDs with high-dose methotrexate. With low-dose (e.g., for RA), use with extreme caution, monitor CBC and renal function.",
  },
  {
    drug1: "methotrexate",
    drug2: "trimethoprim",
    severity: "HIGH",
    mechanism: "Both are folate antagonists; trimethoprim also decreases renal tubular secretion of methotrexate.",
    clinicalEffect: "Increased methotrexate levels and additive bone marrow suppression.",
    recommendation: "Avoid combination. If TMP-SMX required, hold methotrexate and monitor CBC closely.",
  },
  {
    drug1: "lithium",
    drug2: "lisinopril",
    severity: "HIGH",
    mechanism: "ACE inhibitors reduce renal lithium clearance by decreasing GFR and enhancing proximal tubular reabsorption.",
    clinicalEffect: "Lithium toxicity: tremor, ataxia, confusion, renal impairment, cardiac arrhythmias.",
    recommendation: "Monitor lithium levels closely (within 1 week) when starting or adjusting ACE inhibitor. May need lithium dose reduction.",
  },
  {
    drug1: "lithium",
    drug2: "enalapril",
    severity: "HIGH",
    mechanism: "ACE inhibitors reduce renal lithium clearance.",
    clinicalEffect: "Elevated lithium levels with risk of toxicity.",
    recommendation: "Monitor lithium levels frequently. Consider ARB with caution (similar interaction) or alternative mood stabilizer.",
  },
  {
    drug1: "lithium",
    drug2: "hydrochlorothiazide",
    severity: "HIGH",
    mechanism: "Thiazide diuretics increase proximal tubular reabsorption of lithium due to sodium depletion.",
    clinicalEffect: "Lithium toxicity from reduced renal clearance (lithium levels can increase 25-40%).",
    recommendation: "Reduce lithium dose by 25-50% when adding thiazide. Monitor lithium level within 5 days and then weekly for a month.",
  },
  {
    drug1: "digoxin",
    drug2: "amiodarone",
    severity: "HIGH",
    mechanism: "Amiodarone inhibits P-glycoprotein and reduces renal and non-renal clearance of digoxin.",
    clinicalEffect: "Digoxin toxicity: nausea, vomiting, visual disturbances, cardiac arrhythmias (typically increases digoxin level by 70-100%).",
    recommendation: "Reduce digoxin dose by 50% when initiating amiodarone. Monitor digoxin levels within 1 week and adjust accordingly.",
  },
  {
    drug1: "digoxin",
    drug2: "verapamil",
    severity: "HIGH",
    mechanism: "Verapamil inhibits P-glycoprotein-mediated renal and biliary secretion of digoxin.",
    clinicalEffect: "Increased digoxin levels (50-75% increase), risk of toxicity with bradycardia and heart block.",
    recommendation: "Reduce digoxin dose by 33-50%. Monitor digoxin levels and heart rate/rhythm closely.",
  },
  {
    drug1: "simvastatin",
    drug2: "gemfibrozil",
    severity: "HIGH",
    mechanism: "Gemfibrozil inhibits OATP1B1 and CYP2C8, markedly increasing statin exposure (particularly simvastatin and lovastatin).",
    clinicalEffect: "Severe rhabdomyolysis risk (5-10 fold increase in statin AUC).",
    recommendation: "CONTRAINDICATED. Use fenofibrate instead of gemfibrozil with statins, or switch to a statin with lower interaction risk (pravastatin, rosuvastatin).",
  },
  {
    drug1: "simvastatin",
    drug2: "clarithromycin",
    severity: "HIGH",
    mechanism: "Clarithromycin is a potent CYP3A4 inhibitor; simvastatin is extensively metabolized by CYP3A4.",
    clinicalEffect: "Markedly increased simvastatin levels; risk of rhabdomyolysis.",
    recommendation: "CONTRAINDICATED during clarithromycin therapy. Hold simvastatin during antibiotic course or use azithromycin instead.",
  },
  {
    drug1: "clopidogrel",
    drug2: "omeprazole",
    severity: "MODERATE",
    mechanism: "Omeprazole inhibits CYP2C19, which is required to convert clopidogrel prodrug to its active metabolite.",
    clinicalEffect: "Reduced antiplatelet effect of clopidogrel; increased risk of cardiovascular events.",
    recommendation: "Use pantoprazole (minimal CYP2C19 interaction) instead of omeprazole or esomeprazole. If PPI needed, avoid omeprazole/esomeprazole.",
  },
  {
    drug1: "clopidogrel",
    drug2: "esomeprazole",
    severity: "MODERATE",
    mechanism: "Esomeprazole inhibits CYP2C19, reducing clopidogrel activation.",
    clinicalEffect: "Diminished antiplatelet efficacy.",
    recommendation: "Switch to pantoprazole or consider H2 blocker (famotidine). FDA warning against concomitant use.",
  },
  {
    drug1: "lisinopril",
    drug2: "spironolactone",
    severity: "HIGH",
    mechanism: "ACE inhibitors reduce aldosterone, and spironolactone blocks aldosterone receptors, causing additive potassium retention.",
    clinicalEffect: "Severe hyperkalemia, potentially causing fatal cardiac arrhythmias.",
    recommendation: "If combination necessary (e.g., heart failure), start spironolactone at low dose (12.5-25 mg), monitor potassium within 3 days and 1 week, then monthly. Avoid if eGFR <30 or K+ >5.0.",
  },
  {
    drug1: "enalapril",
    drug2: "amiloride",
    severity: "HIGH",
    mechanism: "Additive potassium retention from ACE inhibitor + potassium-sparing diuretic.",
    clinicalEffect: "Hyperkalemia with risk of cardiac arrhythmias.",
    recommendation: "Avoid combination unless closely monitored. Check potassium within 1 week and monitor regularly.",
  },
  {
    drug1: "metformin",
    drug2: "iodinated contrast dye",
    severity: "HIGH",
    mechanism: "Contrast-induced nephropathy can impair metformin clearance, leading to accumulation.",
    clinicalEffect: "Lactic acidosis (rare but potentially fatal).",
    recommendation: "Hold metformin at time of or before contrast administration. Reassess renal function 48 hours after procedure; restart metformin if eGFR stable.",
  },
  {
    drug1: "potassium chloride",
    drug2: "spironolactone",
    severity: "HIGH",
    mechanism: "Potassium supplement + potassium-sparing diuretic causes additive potassium retention.",
    clinicalEffect: "Severe hyperkalemia.",
    recommendation: "Avoid routine potassium supplementation with potassium-sparing diuretics. Monitor potassium levels closely if combination is necessary.",
  },
  {
    drug1: "sildenafil",
    drug2: "nitroglycerin",
    severity: "HIGH",
    mechanism: "PDE5 inhibitors potentiate the hypotensive effect of nitrates by enhancing cGMP-mediated vasodilation.",
    clinicalEffect: "Severe, potentially fatal hypotension.",
    recommendation: "CONTRAINDICATED. Do not administer nitrates within 24 hours of sildenafil or 48 hours of tadalafil.",
  },
  {
    drug1: "carbamazepine",
    drug2: "erythromycin",
    severity: "HIGH",
    mechanism: "Erythromycin inhibits CYP3A4, the primary metabolic pathway for carbamazepine.",
    clinicalEffect: "Carbamazepine toxicity: dizziness, ataxia, diplopia, nausea, cardiac conduction abnormalities.",
    recommendation: "Avoid erythromycin. Use azithromycin (minimal CYP3A4 interaction). If unavoidable, reduce carbamazepine dose and monitor levels.",
  },
  {
    drug1: "theophylline",
    drug2: "ciprofloxacin",
    severity: "HIGH",
    mechanism: "Ciprofloxacin potently inhibits CYP1A2, the major enzyme metabolizing theophylline.",
    clinicalEffect: "Theophylline toxicity: nausea, vomiting, tachycardia, seizures.",
    recommendation: "Reduce theophylline dose by 30-50% when starting ciprofloxacin. Monitor theophylline levels. Consider levofloxacin (weaker CYP1A2 inhibitor) or non-fluoroquinolone alternative.",
  },
  {
    drug1: "fluconazole",
    drug2: "warfarin",
    severity: "HIGH",
    mechanism: "Fluconazole is a potent CYP2C9 inhibitor, markedly reducing warfarin metabolism.",
    clinicalEffect: "Significantly elevated INR with high bleeding risk.",
    recommendation: "Reduce warfarin dose by 25-50% when starting fluconazole. Monitor INR within 3-4 days and adjust.",
  },
  {
    drug1: "amlodipine",
    drug2: "simvastatin",
    severity: "MODERATE",
    mechanism: "Amlodipine inhibits CYP3A4, increasing simvastatin exposure.",
    clinicalEffect: "Increased risk of myopathy and rhabdomyolysis.",
    recommendation: "Limit simvastatin dose to 20 mg daily when co-administered with amlodipine. Consider switching to atorvastatin or rosuvastatin.",
  },
  {
    drug1: "phenytoin",
    drug2: "fluconazole",
    severity: "HIGH",
    mechanism: "Fluconazole inhibits CYP2C9 and CYP2C19, which metabolize phenytoin.",
    clinicalEffect: "Phenytoin toxicity: nystagmus, ataxia, confusion, seizures.",
    recommendation: "Monitor phenytoin levels closely. Reduce phenytoin dose as needed. Consider alternative antifungal.",
  },
  {
    drug1: "cyclosporine",
    drug2: "ketoconazole",
    severity: "HIGH",
    mechanism: "Ketoconazole potently inhibits CYP3A4 and P-glycoprotein, which clear cyclosporine.",
    clinicalEffect: "Markedly increased cyclosporine levels with nephrotoxicity, hepatotoxicity, and immunosuppression.",
    recommendation: "Avoid combination if possible. If used, reduce cyclosporine dose by 50-80% and monitor trough levels closely.",
  },
  {
    drug1: "methotrexate",
    drug2: "penicillin",
    severity: "MODERATE",
    mechanism: "Penicillins reduce renal tubular secretion of methotrexate.",
    clinicalEffect: "Increased methotrexate levels with potential toxicity.",
    recommendation: "Monitor methotrexate levels and renal function. May need methotrexate dose adjustment. More significant with high-dose methotrexate.",
  },
  {
    drug1: "clonidine",
    drug2: "propranolol",
    severity: "HIGH",
    mechanism: "Beta-blockers can exacerbate rebound hypertension when clonidine is withdrawn. Concurrent use can cause excessive bradycardia.",
    clinicalEffect: "Severe rebound hypertension if clonidine stopped while on beta-blocker; excessive bradycardia during concurrent use.",
    recommendation: "If discontinuing, taper clonidine first while continuing beta-blocker, then taper beta-blocker. Monitor heart rate and blood pressure.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CLINICAL GUIDELINES
// ═══════════════════════════════════════════════════════════════════════════════

export interface GuidelineTarget {
  measure: string;
  target: string;
  loincCode?: string;
}

export interface ClinicalGuideline {
  id: string;
  condition: string;
  source: string;
  targets: GuidelineTarget[];
  firstLineMedications: string[];
  monitoringSchedule: string;
}

export const CLINICAL_GUIDELINES: ClinicalGuideline[] = [
  {
    id: "type2-diabetes",
    condition: "Type 2 Diabetes Mellitus",
    source: "ADA Standards of Care 2025",
    targets: [
      { measure: "HbA1c", target: "<7.0%", loincCode: "4548-4" },
      { measure: "Fasting Glucose", target: "80-130 mg/dL", loincCode: "2345-7" },
      { measure: "Blood Pressure", target: "<130/80 mmHg" },
      { measure: "LDL Cholesterol", target: "<100 mg/dL (or <70 if ASCVD)", loincCode: "2089-1" },
      { measure: "eGFR", target: "Monitor for decline", loincCode: "33914-3" },
      { measure: "Urine Albumin-to-Creatinine Ratio", target: "<30 mg/g" },
    ],
    firstLineMedications: [
      "Metformin",
      "GLP-1 receptor agonist (semaglutide, liraglutide) - if ASCVD or high risk",
      "SGLT2 inhibitor (empagliflozin, dapagliflozin) - if HF or CKD",
    ],
    monitoringSchedule:
      "HbA1c every 3-6 months. Annual: lipid panel, eGFR/Cr, urine albumin, dilated eye exam, comprehensive foot exam. Blood pressure every visit.",
  },
  {
    id: "hypertension",
    condition: "Hypertension",
    source: "2017 ACC/AHA Hypertension Guideline",
    targets: [
      { measure: "Systolic Blood Pressure", target: "<130 mmHg" },
      { measure: "Diastolic Blood Pressure", target: "<80 mmHg" },
      { measure: "Potassium (if on ACEi/ARB/diuretic)", target: "3.5-5.0 mEq/L", loincCode: "2823-3" },
      { measure: "Creatinine/eGFR", target: "Monitor for changes", loincCode: "2160-0" },
    ],
    firstLineMedications: [
      "ACE inhibitor (lisinopril, enalapril) or ARB (losartan, valsartan)",
      "Calcium channel blocker (amlodipine)",
      "Thiazide diuretic (chlorthalidone, hydrochlorothiazide)",
    ],
    monitoringSchedule:
      "Blood pressure every 1-3 months until at goal, then every 3-6 months. BMP (potassium, creatinine) within 2-4 weeks of starting/adjusting ACEi/ARB/diuretic, then annually.",
  },
  {
    id: "heart-failure",
    condition: "Heart Failure with Reduced Ejection Fraction (HFrEF)",
    source: "2022 ACC/AHA/HFSA Heart Failure Guideline",
    targets: [
      { measure: "LVEF", target: "Monitor for improvement" },
      { measure: "BNP or NT-proBNP", target: "Trending downward indicates response to therapy" },
      { measure: "Potassium", target: "4.0-5.0 mEq/L", loincCode: "2823-3" },
      { measure: "Creatinine/eGFR", target: "Tolerate up to 30% rise in Cr with ACEi/ARB initiation", loincCode: "2160-0" },
      { measure: "Blood Pressure", target: "Systolic >90 mmHg (to tolerate GDMT)" },
    ],
    firstLineMedications: [
      "ARNI (sacubitril-valsartan) - preferred over ACEi/ARB",
      "Beta-blocker (carvedilol, metoprolol succinate, bisoprolol)",
      "Mineralocorticoid receptor antagonist (spironolactone, eplerenone)",
      "SGLT2 inhibitor (dapagliflozin, empagliflozin)",
    ],
    monitoringSchedule:
      "BMP within 1-2 weeks of GDMT initiation/titration. BNP/NT-proBNP at diagnosis and to guide therapy. Weight daily (patient self-monitoring). Follow-up within 7-14 days of discharge. Echo in 3-6 months after optimization.",
  },
  {
    id: "atrial-fibrillation",
    condition: "Atrial Fibrillation",
    source: "2023 ACC/AHA/ACCP/HRS Atrial Fibrillation Guideline",
    targets: [
      { measure: "Ventricular Rate", target: "<110 bpm at rest (rate control) or <80 bpm if symptomatic" },
      { measure: "CHA2DS2-VASc Score", target: "Guides anticoagulation decision" },
      { measure: "INR (if on warfarin)", target: "2.0-3.0", loincCode: "6301-6" },
      { measure: "Renal Function", target: "Monitor for DOAC dose adjustment", loincCode: "33914-3" },
    ],
    firstLineMedications: [
      "Rate control: Beta-blocker (metoprolol, atenolol) or Calcium channel blocker (diltiazem, verapamil)",
      "Anticoagulation: DOAC (apixaban, rivaroxaban, dabigatran, edoxaban) preferred over warfarin",
      "Rhythm control: Flecainide, propafenone (if no structural heart disease); amiodarone, sotalol, dofetilide",
    ],
    monitoringSchedule:
      "INR monthly if on warfarin. Renal function and CBC annually (more frequently with DOACs if CKD). ECG at each visit. Annual echo to assess structure/function.",
  },
  {
    id: "copd",
    condition: "Chronic Obstructive Pulmonary Disease (COPD)",
    source: "GOLD 2025 Report",
    targets: [
      { measure: "FEV1", target: "Monitor for decline" },
      { measure: "Exacerbation Frequency", target: "<2 moderate or 0 hospitalizations per year" },
      { measure: "mMRC Dyspnea Scale", target: "<2" },
      { measure: "CAT Score", target: "<10" },
      { measure: "Oxygen Saturation", target: ">= 88-92%" },
    ],
    firstLineMedications: [
      "LAMA (tiotropium, umeclidinium) for all symptomatic COPD",
      "LABA + LAMA (umeclidinium-vilanterol, tiotropium-olodaterol) if persistent symptoms",
      "LABA + LAMA + ICS (fluticasone furoate-umeclidinium-vilanterol) if frequent exacerbations with eosinophils >= 300",
      "Rescue: SABA (albuterol)",
    ],
    monitoringSchedule:
      "Spirometry at diagnosis and annually or if worsening. Symptom assessment (CAT/mMRC) every visit. Exacerbation history every visit. Annual influenza and pneumococcal vaccination. Pulse oximetry as needed.",
  },
  {
    id: "asthma",
    condition: "Asthma",
    source: "GINA 2024 Global Strategy for Asthma Management",
    targets: [
      { measure: "Daytime Symptoms", target: "<=2 days/week" },
      { measure: "Night Awakening", target: "None" },
      { measure: "SABA Use for Symptoms", target: "<=2 days/week" },
      { measure: "Activity Limitation", target: "None" },
      { measure: "FEV1 or Peak Flow", target: ">80% predicted/personal best" },
    ],
    firstLineMedications: [
      "Track 1 (preferred): Low-dose ICS-formoterol as needed (mild) or as maintenance and reliever (moderate)",
      "Track 2 (alternative): Low-dose ICS whenever SABA used (mild); low-dose ICS maintenance + SABA as needed (moderate)",
      "Step up: Medium/high-dose ICS-LABA; add-on LAMA; consider biologic therapy if severe",
    ],
    monitoringSchedule:
      "Symptom control assessment every 1-3 months. Spirometry at diagnosis, after 3-6 months of treatment, then periodically. Review inhaler technique and adherence every visit.",
  },
  {
    id: "ckd",
    condition: "Chronic Kidney Disease (CKD)",
    source: "KDIGO 2024 CKD Guideline",
    targets: [
      { measure: "eGFR", target: "Slow rate of decline", loincCode: "33914-3" },
      { measure: "Urine Albumin-to-Creatinine Ratio", target: "<30 mg/g or reduction >30% from baseline" },
      { measure: "Blood Pressure", target: "<120/80 mmHg (if albuminuria present)" },
      { measure: "Potassium", target: "3.5-5.0 mEq/L", loincCode: "2823-3" },
      { measure: "Bicarbonate", target: ">22 mEq/L", loincCode: "2028-9" },
      { measure: "Hemoglobin", target: "10-11.5 g/dL (if anemia of CKD)", loincCode: "718-7" },
    ],
    firstLineMedications: [
      "ACE inhibitor or ARB (if albuminuria present)",
      "SGLT2 inhibitor (dapagliflozin, empagliflozin) - for CKD with eGFR >=20",
      "Finerenone - for diabetic kidney disease with persistent albuminuria on max ACEi/ARB",
    ],
    monitoringSchedule:
      "eGFR and urine albumin: G1-G2 annually, G3a every 6 months, G3b-G4 every 3 months, G5 every 1-3 months. BMP including potassium with each eGFR check. CBC and iron studies if anemia. PTH and vitamin D for G3b+.",
  },
  {
    id: "hyperlipidemia",
    condition: "Hyperlipidemia / Dyslipidemia",
    source: "2018 ACC/AHA Cholesterol Guideline",
    targets: [
      { measure: "LDL Cholesterol", target: "<70 mg/dL (very high risk) or <100 mg/dL (high risk) or >= 50% reduction", loincCode: "2089-1" },
      { measure: "Non-HDL Cholesterol", target: "LDL target + 30 mg/dL" },
      { measure: "Triglycerides", target: "<150 mg/dL", loincCode: "2571-8" },
      { measure: "ALT", target: "Monitor for hepatotoxicity", loincCode: "1742-6" },
    ],
    firstLineMedications: [
      "High-intensity statin: Atorvastatin 40-80 mg or Rosuvastatin 20-40 mg",
      "Moderate-intensity statin: Atorvastatin 10-20 mg, Rosuvastatin 5-10 mg, Simvastatin 20-40 mg",
      "Add-on: Ezetimibe if not at goal on max tolerated statin",
      "Add-on: PCSK9 inhibitor (evolocumab, alirocumab) if ASCVD and LDL >=70 on max statin+ezetimibe",
    ],
    monitoringSchedule:
      "Fasting lipid panel 4-12 weeks after starting/adjusting therapy, then every 3-12 months. ALT at baseline and as clinically indicated. Monitor for myalgias. CK if symptomatic.",
  },
  {
    id: "coronary-artery-disease",
    condition: "Coronary Artery Disease (Chronic CAD / Stable Ischemic Heart Disease)",
    source: "2023 ACC/AHA Chronic Coronary Disease Guideline",
    targets: [
      { measure: "LDL Cholesterol", target: "<70 mg/dL", loincCode: "2089-1" },
      { measure: "Blood Pressure", target: "<130/80 mmHg" },
      { measure: "HbA1c (if diabetic)", target: "<7.0%", loincCode: "4548-4" },
      { measure: "Heart Rate (if on beta-blocker)", target: "55-60 bpm at rest" },
    ],
    firstLineMedications: [
      "Aspirin 75-100 mg daily (or clopidogrel if aspirin-intolerant)",
      "High-intensity statin (atorvastatin 80 mg or rosuvastatin 40 mg)",
      "Beta-blocker (if prior MI or LV dysfunction)",
      "ACE inhibitor/ARB (if EF <=40%, hypertension, diabetes, or CKD)",
      "Nitroglycerin sublingual PRN for anginal episodes",
    ],
    monitoringSchedule:
      "Lipid panel annually. Stress testing if new or worsening symptoms. Echo if HF suspected. Annual influenza vaccine. Cardiac rehab referral if post-ACS/revascularization.",
  },
  {
    id: "dvt-pe",
    condition: "Venous Thromboembolism (DVT/PE)",
    source: "ASH 2020 VTE Treatment Guidelines / CHEST 2021",
    targets: [
      { measure: "INR (if on warfarin)", target: "2.0-3.0", loincCode: "6301-6" },
      { measure: "Renal Function (DOAC dosing)", target: "Adjust dose for CrCl <50", loincCode: "33914-3" },
      { measure: "Platelet Count (if on heparin)", target: ">150 x10^3/uL (monitor for HIT)", loincCode: "777-3" },
      { measure: "CBC", target: "Monitor for bleeding" },
    ],
    firstLineMedications: [
      "DOAC preferred: Apixaban or Rivaroxaban (no initial heparin needed)",
      "Alternative DOAC: Dabigatran or Edoxaban (after 5-10 days of parenteral anticoagulation)",
      "Warfarin (with LMWH bridge) if DOACs contraindicated",
      "Duration: 3 months minimum; extended if unprovoked, recurrent, or ongoing risk factors",
    ],
    monitoringSchedule:
      "CBC at baseline and periodically. INR 2-3x/week initially then monthly if on warfarin. Renal function at baseline and annually for DOACs. Reassess duration at 3 months. Monitor for bleeding symptoms.",
  },
  {
    id: "osteoporosis",
    condition: "Osteoporosis",
    source: "2020 AACE/ACE / Endocrine Society Guidelines",
    targets: [
      { measure: "DEXA T-score", target: "Improvement or stabilization from baseline" },
      { measure: "Calcium intake", target: "1000-1200 mg/day (diet + supplements)" },
      { measure: "Vitamin D (25-OH)", target: ">30 ng/mL" },
      { measure: "Serum Calcium", target: "Normal range (8.5-10.5 mg/dL)", loincCode: "17861-6" },
    ],
    firstLineMedications: [
      "Bisphosphonate: Alendronate 70 mg weekly or Risedronate 150 mg monthly or Zoledronic acid 5 mg IV yearly",
      "Denosumab 60 mg SC every 6 months (if bisphosphonate contraindicated/intolerant)",
      "Teriparatide or Abaloparatide (if very high fracture risk or bisphosphonate failure)",
      "Romosozumab (for very high fracture risk, first 12 months then transition to antiresorptive)",
    ],
    monitoringSchedule:
      "DEXA every 1-2 years while on therapy. Serum calcium and vitamin D at baseline and annually. Reassess fracture risk after 3-5 years of bisphosphonate to consider drug holiday. Dental exam before starting bisphosphonate (ONJ risk).",
  },
  {
    id: "depression",
    condition: "Major Depressive Disorder",
    source: "APA Practice Guidelines for MDD (2023 update)",
    targets: [
      { measure: "PHQ-9 Score", target: "<5 (remission)" },
      { measure: "Functional Status", target: "Return to baseline function" },
      { measure: "TSH (before treatment)", target: "0.4-4.0 mIU/L (rule out hypothyroidism)", loincCode: "3016-3" },
    ],
    firstLineMedications: [
      "SSRI: Sertraline, Escitalopram, Fluoxetine (first-line for most patients)",
      "SNRI: Venlafaxine, Duloxetine (if SSRI inadequate or comorbid pain/anxiety)",
      "Bupropion (if sexual side effects concern, smoking cessation desired, or fatigue predominant)",
      "Mirtazapine (if insomnia and appetite loss are prominent)",
    ],
    monitoringSchedule:
      "Follow-up within 1-2 weeks of starting medication to assess tolerability and suicidality. PHQ-9 at each visit. Reassess response at 4-6 weeks. If partial response at 4-8 weeks, optimize dose. If no response at 6-8 weeks, switch or augment.",
  },
  {
    id: "hypothyroidism",
    condition: "Hypothyroidism",
    source: "ATA 2014 Guidelines for Hypothyroidism",
    targets: [
      { measure: "TSH", target: "0.5-2.5 mIU/L (general) or 0.5-4.0 mIU/L (elderly)", loincCode: "3016-3" },
      { measure: "Free T4", target: "Within normal range" },
    ],
    firstLineMedications: [
      "Levothyroxine (T4): Weight-based dosing ~1.6 mcg/kg/day (full replacement) or start 25-50 mcg/day in elderly/cardiac patients",
    ],
    monitoringSchedule:
      "TSH 6-8 weeks after initiation or dose change. Once stable, TSH every 6-12 months. Recheck if symptoms change, weight changes significantly, or new medications added (especially calcium, iron, PPIs which affect absorption).",
  },
  {
    id: "obesity",
    condition: "Obesity",
    source: "Endocrine Society 2024 / AGA 2024 Guidelines",
    targets: [
      { measure: "BMI", target: "Reduce by >=5-10% of body weight as initial goal" },
      { measure: "Waist Circumference", target: "<40 inches (male), <35 inches (female)" },
      { measure: "HbA1c", target: "<5.7% (prevent diabetes)", loincCode: "4548-4" },
      { measure: "Blood Pressure", target: "<130/80 mmHg" },
      { measure: "Lipid Panel", target: "Within normal limits" },
    ],
    firstLineMedications: [
      "GLP-1 receptor agonist: Semaglutide 2.4 mg weekly (Wegovy) - preferred first-line pharmacotherapy",
      "Tirzepatide (Zepbound) - dual GIP/GLP-1 agonist for BMI >=30 or >=27 with comorbidity",
      "Phentermine-topiramate ER (Qsymia) - if GLP-1 RA not available/tolerated",
      "Naltrexone-bupropion (Contrave)",
      "Orlistat (if other options not available)",
    ],
    monitoringSchedule:
      "Weight and BMI every visit. Metabolic panel, lipids, HbA1c at baseline and every 3-6 months. Assess for sleep apnea, NAFLD/NASH. Mental health screening. Nutritional assessment with dietary counseling.",
  },
  {
    id: "anemia",
    condition: "Iron Deficiency Anemia",
    source: "ASH/BSH Guidelines for Iron Deficiency Anemia",
    targets: [
      { measure: "Hemoglobin", target: ">12 g/dL (female), >13 g/dL (male)", loincCode: "718-7" },
      { measure: "Ferritin", target: ">30 ng/mL (general) or >100 ng/mL (CKD/HF)" },
      { measure: "Transferrin Saturation (TSAT)", target: "20-50%" },
      { measure: "MCV", target: "80-100 fL", loincCode: "787-2" },
    ],
    firstLineMedications: [
      "Oral iron: Ferrous sulfate 325 mg (65 mg elemental iron) every other day (better absorption than daily)",
      "IV iron: Ferric carboxymaltose 750 mg or Iron sucrose 200-300 mg (if oral not tolerated, CKD, IBD, or severe deficiency)",
      "Investigate and treat underlying cause (GI bleeding, menorrhagia, celiac disease, etc.)",
    ],
    monitoringSchedule:
      "CBC and reticulocyte count at 2-4 weeks (expect reticulocyte rise). Hemoglobin at 4-8 weeks. Ferritin and TSAT at 8-12 weeks. Continue oral iron 3-6 months after hemoglobin normalizes to replete stores. Investigate cause if not responding.",
  },
];
