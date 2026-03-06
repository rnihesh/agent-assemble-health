import type { FHIRClient } from "../fhir/client.js";
import { getPatient } from "../fhir/queries/patient.js";
import { getConditions } from "../fhir/queries/conditions.js";
import { getRecentLabs, getRecentVitals } from "../fhir/queries/observations.js";
import { RISK_SCORE_FORMULAS } from "../config/constants.js";
import {
  getPatientAge,
  getPatientSex,
  formatHumanName,
  getCodeDisplay,
  getLoincCode,
  conditionMatchesKeywords,
  calculateEGFR,
} from "../utils/fhir-helpers.js";
import type { Condition, Observation } from "../fhir/types.js";

export type CalculatorType =
  | "CHA2DS2-VASc"
  | "HEART"
  | "Wells-DVT"
  | "Wells-PE"
  | "ASCVD"
  | "CKD-EPI";

export interface RiskCalculatorInput {
  patientId: string;
  calculator: CalculatorType;
}

interface VariableUsed {
  name: string;
  value: string | number | boolean;
  source: string; // "FHIR", "assumed", "calculated"
  points?: number;
}

export async function calculateRiskScore(
  client: FHIRClient,
  input: RiskCalculatorInput,
): Promise<string> {
  const formula = RISK_SCORE_FORMULAS[input.calculator];
  if (!formula) {
    return `Unknown calculator: ${input.calculator}. Available: ${Object.keys(RISK_SCORE_FORMULAS).join(", ")}`;
  }

  const patient = await getPatient(client, input.patientId);
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);
  const name = patient.name?.length ? formatHumanName(patient.name[0]) : "Unknown";
  const conditions = await getConditions(client, input.patientId);
  const labs = await getRecentLabs(client, input.patientId, 365);
  const vitals = await getRecentVitals(client, input.patientId, 90);

  let result: {
    score: number;
    maxScore: number;
    riskCategory: string;
    interpretation: string;
    variables: VariableUsed[];
    recommendation: string;
  };

  switch (input.calculator) {
    case "CHA2DS2-VASc":
      result = calcCHA2DS2VASc(age, sex, conditions, formula);
      break;
    case "HEART":
      result = calcHEART(age, sex, conditions, labs, vitals, formula);
      break;
    case "Wells-DVT":
      result = calcWellsDVT(conditions, formula);
      break;
    case "Wells-PE":
      result = calcWellsPE(conditions, vitals, formula);
      break;
    case "ASCVD":
      return calcASCVD(age, sex, conditions, labs, vitals, formula);
    case "CKD-EPI":
      return calcCKDEPI(age, sex, labs, formula);
  }

  // Format output
  const parts: string[] = [];
  parts.push(`# ${formula.fullName}`);
  parts.push(`*${formula.description}*`);
  parts.push("");
  parts.push(`**Patient:** ${name} | Age: ${age} | Sex: ${capitalize(sex)}`);
  parts.push("");
  parts.push(`## Score: ${result.score} / ${result.maxScore}`);
  parts.push(`**Risk Category:** ${result.riskCategory}`);
  parts.push("");
  parts.push("## Variables Used");
  parts.push("| Variable | Value | Source | Points |");
  parts.push("|----------|-------|--------|--------|");
  for (const v of result.variables) {
    parts.push(
      `| ${v.name} | ${v.value} | ${v.source} | ${v.points !== undefined ? v.points : "-"} |`,
    );
  }
  parts.push("");
  parts.push("## Interpretation");
  parts.push(result.interpretation);
  parts.push("");
  parts.push("## Clinical Recommendation");
  parts.push(result.recommendation);
  parts.push("");
  parts.push("## References");
  for (const ref of formula.references) {
    parts.push(`- ${ref}`);
  }
  parts.push("");
  parts.push(
    "*This score is for clinical decision support and should be interpreted in the context of the full clinical picture.*",
  );

  return parts.join("\n");
}

// ── Calculator implementations ───────────────────────────────────────────────

function calcCHA2DS2VASc(
  age: number,
  sex: string,
  conditions: Condition[],
  formula: typeof RISK_SCORE_FORMULAS[string],
) {
  const variables: VariableUsed[] = [];
  let score = 0;

  // CHF
  const hasHF = hasCondition(conditions, ["heart failure", "cardiomyopathy", "ventricular dysfunction"]);
  variables.push({ name: "Congestive Heart Failure", value: hasHF, source: "FHIR", points: hasHF ? 1 : 0 });
  if (hasHF) score += 1;

  // Hypertension
  const hasHTN = hasCondition(conditions, ["hypertension", "hypertensive", "high blood pressure"]);
  variables.push({ name: "Hypertension", value: hasHTN, source: "FHIR", points: hasHTN ? 1 : 0 });
  if (hasHTN) score += 1;

  // Age >= 75
  const age75 = age >= 75;
  variables.push({ name: "Age >= 75", value: age75, source: "FHIR", points: age75 ? 2 : 0 });
  if (age75) score += 2;

  // Diabetes
  const hasDM = hasCondition(conditions, ["diabetes", "diabetic"]);
  variables.push({ name: "Diabetes", value: hasDM, source: "FHIR", points: hasDM ? 1 : 0 });
  if (hasDM) score += 1;

  // Stroke/TIA
  const hasStroke = hasCondition(conditions, ["stroke", "cerebrovascular", "tia", "transient ischemic"]);
  variables.push({ name: "Stroke/TIA/Thromboembolism", value: hasStroke, source: "FHIR", points: hasStroke ? 2 : 0 });
  if (hasStroke) score += 2;

  // Vascular disease
  const hasVascular = hasCondition(conditions, ["myocardial infarction", "peripheral arterial", "peripheral vascular", "aortic plaque", "pad"]);
  variables.push({ name: "Vascular Disease", value: hasVascular, source: "FHIR", points: hasVascular ? 1 : 0 });
  if (hasVascular) score += 1;

  // Age 65-74
  const age65to74 = age >= 65 && age < 75;
  variables.push({ name: "Age 65-74", value: age65to74, source: "FHIR", points: age65to74 ? 1 : 0 });
  if (age65to74) score += 1;

  // Female sex
  const isFemale = sex === "female";
  variables.push({ name: "Sex: Female", value: isFemale, source: "FHIR", points: isFemale ? 1 : 0 });
  if (isFemale) score += 1;

  const category = getCategory(score, formula.categories);

  return {
    score,
    maxScore: formula.maxScore,
    riskCategory: category.label,
    interpretation: `A CHA2DS2-VASc score of ${score} places this patient in the ${category.label} risk category for stroke in the setting of atrial fibrillation.`,
    variables,
    recommendation: category.recommendation,
  };
}

function calcHEART(
  age: number,
  sex: string,
  conditions: Condition[],
  labs: Observation[],
  vitals: Observation[],
  formula: typeof RISK_SCORE_FORMULAS[string],
) {
  const variables: VariableUsed[] = [];
  let score = 0;

  // History -- cannot be auto-determined from structured data; default to 1 (moderately suspicious)
  const historyPoints = 1;
  score += historyPoints;
  variables.push({ name: "History", value: "Moderately suspicious (default)", source: "assumed", points: historyPoints });

  // ECG -- cannot be auto-determined; default to 1
  const ecgPoints = 1;
  score += ecgPoints;
  variables.push({ name: "ECG", value: "Non-specific repolarization abnormality (default)", source: "assumed", points: ecgPoints });

  // Age
  let agePoints = 0;
  if (age < 45) agePoints = 0;
  else if (age <= 64) agePoints = 1;
  else agePoints = 2;
  score += agePoints;
  variables.push({ name: "Age", value: age, source: "FHIR", points: agePoints });

  // Risk factors
  const riskFactors: string[] = [];
  if (hasCondition(conditions, ["hypertension"])) riskFactors.push("HTN");
  if (hasCondition(conditions, ["diabetes"])) riskFactors.push("DM");
  if (hasCondition(conditions, ["hyperlipidemia", "hypercholesterolemia", "dyslipidemia"])) riskFactors.push("Hyperlipidemia");
  if (hasCondition(conditions, ["obesity", "obese"])) riskFactors.push("Obesity");
  if (hasCondition(conditions, ["coronary", "atherosclerotic", "ischemic heart"])) riskFactors.push("Known atherosclerotic disease");

  let riskPoints = 0;
  if (riskFactors.some((r) => r === "Known atherosclerotic disease") || riskFactors.length >= 3) {
    riskPoints = 2;
  } else if (riskFactors.length >= 1) {
    riskPoints = 1;
  }
  score += riskPoints;
  variables.push({
    name: "Risk Factors",
    value: riskFactors.length > 0 ? riskFactors.join(", ") : "None identified",
    source: "FHIR",
    points: riskPoints,
  });

  // Troponin
  const troponinObs = findLabByLoinc(labs, ["49563-0"]);
  let troponinPoints = 0;
  let troponinValue = "Not available";
  if (troponinObs?.valueQuantity?.value !== undefined) {
    const trop = troponinObs.valueQuantity.value;
    troponinValue = `${trop} ${troponinObs.valueQuantity.unit ?? "ng/mL"}`;
    const normalLimit = sex === "female" ? 0.03 : 0.04;
    if (trop <= normalLimit) troponinPoints = 0;
    else if (trop <= normalLimit * 3) troponinPoints = 1;
    else troponinPoints = 2;
  } else {
    troponinPoints = 0;
    troponinValue = "Not available (scored as 0)";
  }
  score += troponinPoints;
  variables.push({ name: "Troponin", value: troponinValue, source: troponinObs ? "FHIR" : "assumed", points: troponinPoints });

  const category = getCategory(score, formula.categories);

  return {
    score,
    maxScore: formula.maxScore,
    riskCategory: category.label,
    interpretation: `A HEART score of ${score} indicates ${category.label.toLowerCase()} risk for major adverse cardiac events at 6 weeks. Note: History and ECG components were assigned default values as they require clinical assessment.`,
    variables,
    recommendation: category.recommendation,
  };
}

function calcWellsDVT(
  conditions: Condition[],
  formula: typeof RISK_SCORE_FORMULAS[string],
) {
  const variables: VariableUsed[] = [];
  let score = 0;

  // Active cancer
  const hasCancer = hasCondition(conditions, ["cancer", "malignant", "neoplasm", "carcinoma", "lymphoma", "leukemia"]);
  variables.push({ name: "Active Cancer", value: hasCancer, source: "FHIR", points: hasCancer ? 1 : 0 });
  if (hasCancer) score += 1;

  // Paralysis/paresis
  const hasParalysis = hasCondition(conditions, ["paralysis", "paresis", "hemiplegia", "paraplegia"]);
  variables.push({ name: "Paralysis/Paresis", value: hasParalysis, source: "FHIR", points: hasParalysis ? 1 : 0 });
  if (hasParalysis) score += 1;

  // Bedridden/surgery - cannot determine from conditions alone; default false
  variables.push({ name: "Bedridden >3 days / Recent Surgery", value: false, source: "assumed", points: 0 });

  // Local tenderness - requires physical exam; default false
  variables.push({ name: "Local Tenderness Along Deep Veins", value: false, source: "assumed", points: 0 });

  // Entire leg swollen - requires exam; default false
  variables.push({ name: "Entire Leg Swollen", value: false, source: "assumed", points: 0 });

  // Calf swelling - requires exam; default false
  variables.push({ name: "Calf Swelling >3cm", value: false, source: "assumed", points: 0 });

  // Pitting edema
  const hasEdema = hasCondition(conditions, ["edema", "oedema"]);
  variables.push({ name: "Pitting Edema", value: hasEdema, source: "FHIR", points: hasEdema ? 1 : 0 });
  if (hasEdema) score += 1;

  // Collateral veins - requires exam; default false
  variables.push({ name: "Collateral Superficial Veins", value: false, source: "assumed", points: 0 });

  // Previous DVT
  const hasPrevDVT = hasCondition(conditions, ["deep vein thrombosis", "dvt", "venous thrombosis"]);
  variables.push({ name: "Previous DVT", value: hasPrevDVT, source: "FHIR", points: hasPrevDVT ? 1 : 0 });
  if (hasPrevDVT) score += 1;

  // Alternative diagnosis - cannot determine; default false (no subtraction)
  variables.push({ name: "Alternative Diagnosis Equally Likely", value: false, source: "assumed", points: 0 });

  const category = getCategory(score, formula.categories);

  return {
    score,
    maxScore: formula.maxScore,
    riskCategory: category.label,
    interpretation: `A Wells DVT score of ${score} suggests ${category.label.toLowerCase()} pre-test probability. Note: Several criteria require physical examination findings that could not be extracted from structured data and were defaulted to absent. The actual score may be higher.`,
    variables,
    recommendation: category.recommendation,
  };
}

function calcWellsPE(
  conditions: Condition[],
  vitals: Observation[],
  formula: typeof RISK_SCORE_FORMULAS[string],
) {
  const variables: VariableUsed[] = [];
  let score = 0;

  // Clinical signs of DVT - requires exam; default false
  variables.push({ name: "Clinical Signs of DVT", value: false, source: "assumed", points: 0 });

  // PE most likely diagnosis - clinical judgment; default false
  variables.push({ name: "PE Most Likely Diagnosis", value: false, source: "assumed", points: 0 });

  // Heart rate > 100
  const hrObs = vitals.find((v) => {
    const code = getLoincCode(v.code);
    return code === "8867-4" || getCodeDisplay(v.code).toLowerCase().includes("heart rate");
  });
  const hr = hrObs?.valueQuantity?.value;
  const hrHigh = hr !== undefined && hr > 100;
  variables.push({ name: "Heart Rate > 100", value: hrHigh ? `Yes (${hr} bpm)` : hr ? `No (${hr} bpm)` : "Not available", source: hr ? "FHIR" : "assumed", points: hrHigh ? 1.5 : 0 });
  if (hrHigh) score += 1.5;

  // Immobilization/surgery - default false
  variables.push({ name: "Immobilization/Surgery in Past 4 Weeks", value: false, source: "assumed", points: 0 });

  // Previous DVT/PE
  const hasPrevVTE = hasCondition(conditions, ["deep vein thrombosis", "dvt", "pulmonary embolism", "venous thromboembolism"]);
  variables.push({ name: "Previous DVT/PE", value: hasPrevVTE, source: "FHIR", points: hasPrevVTE ? 1.5 : 0 });
  if (hasPrevVTE) score += 1.5;

  // Hemoptysis - default false
  variables.push({ name: "Hemoptysis", value: false, source: "assumed", points: 0 });

  // Cancer
  const hasCancer = hasCondition(conditions, ["cancer", "malignant", "neoplasm", "carcinoma", "lymphoma", "leukemia"]);
  variables.push({ name: "Malignancy", value: hasCancer, source: "FHIR", points: hasCancer ? 1 : 0 });
  if (hasCancer) score += 1;

  const category = getCategory(score, formula.categories);

  return {
    score,
    maxScore: formula.maxScore,
    riskCategory: category.label,
    interpretation: `A Wells PE score of ${score} suggests ${category.label.toLowerCase()} pre-test probability. Note: Several criteria require clinical assessment and were defaulted to absent. The actual score may differ.`,
    variables,
    recommendation: category.recommendation,
  };
}

function calcASCVD(
  age: number,
  sex: string,
  conditions: Condition[],
  labs: Observation[],
  vitals: Observation[],
  formula: typeof RISK_SCORE_FORMULAS[string],
) {
  const variables: VariableUsed[] = [];

  // Gather inputs
  const totalChol = findLabValue(labs, ["2093-3"]);
  const hdl = findLabValue(labs, ["2085-9"]);
  const hasDM = hasCondition(conditions, ["diabetes", "diabetic"]);

  // Systolic BP
  let sbp: number | null = null;
  for (const v of vitals) {
    if (getLoincCode(v.code) === "85354-9" || getCodeDisplay(v.code).toLowerCase().includes("blood pressure")) {
      const sys = v.component?.find((c) => getLoincCode(c.code) === "8480-6");
      if (sys?.valueQuantity?.value) {
        sbp = sys.valueQuantity.value;
        break;
      }
    }
  }

  const onBPTreatment = hasCondition(conditions, ["hypertension"]);
  const isSmoker = hasCondition(conditions, ["smoker", "smoking", "tobacco use", "nicotine dependence"]);
  const isFemale = sex === "female";

  variables.push({ name: "Age", value: age, source: "FHIR" });
  variables.push({ name: "Sex", value: sex, source: "FHIR" });
  variables.push({ name: "Total Cholesterol", value: totalChol ?? "Not available", source: totalChol ? "FHIR" : "assumed" });
  variables.push({ name: "HDL Cholesterol", value: hdl ?? "Not available", source: hdl ? "FHIR" : "assumed" });
  variables.push({ name: "Systolic BP", value: sbp ?? "Not available", source: sbp ? "FHIR" : "assumed" });
  variables.push({ name: "On BP Treatment", value: onBPTreatment, source: "FHIR" });
  variables.push({ name: "Diabetes", value: hasDM, source: "FHIR" });
  variables.push({ name: "Current Smoker", value: isSmoker, source: "FHIR" });

  // Calculate using Pooled Cohort Equations (simplified log-linear model)
  let risk: number;
  if (
    totalChol === null ||
    hdl === null ||
    sbp === null ||
    age < 40 ||
    age > 79
  ) {
    // Cannot compute -- missing data
    const missing: string[] = [];
    if (totalChol === null) missing.push("total cholesterol");
    if (hdl === null) missing.push("HDL cholesterol");
    if (sbp === null) missing.push("systolic BP");
    if (age < 40 || age > 79) missing.push("age 40-79");

    return [
      `# ${formula.fullName}`,
      `*${formula.description}*`,
      "",
      "## Unable to Calculate",
      `Missing required inputs: ${missing.join(", ")}.`,
      "",
      "The Pooled Cohort Equations require age (40-79), total cholesterol, HDL cholesterol, and systolic blood pressure.",
      "",
      "## Variables Available",
      ...variables.map((v) => `- **${v.name}:** ${v.value} (${v.source})`),
    ].join("\n");
  }

  // Pooled Cohort Equations coefficients (White, non-Hispanic -- used as default)
  risk = computePooledCohortRisk(
    age,
    isFemale,
    totalChol,
    hdl,
    sbp,
    onBPTreatment,
    hasDM,
    isSmoker,
  );

  const riskPercent = Math.round(risk * 1000) / 10; // one decimal place

  let categoryLabel: string;
  let recommendation: string;
  if (riskPercent < 5) {
    categoryLabel = "Low";
    recommendation = formula.categories[0].recommendation;
  } else if (riskPercent < 7.5) {
    categoryLabel = "Borderline";
    recommendation = formula.categories[1].recommendation;
  } else if (riskPercent < 20) {
    categoryLabel = "Intermediate";
    recommendation = formula.categories[2].recommendation;
  } else {
    categoryLabel = "High";
    recommendation = formula.categories[3].recommendation;
  }

  const parts: string[] = [];
  parts.push(`# ${formula.fullName}`);
  parts.push(`*${formula.description}*`);
  parts.push("");
  parts.push(`## 10-Year ASCVD Risk: ${riskPercent}%`);
  parts.push(`**Risk Category:** ${categoryLabel}`);
  parts.push("");
  parts.push("## Variables Used");
  for (const v of variables) {
    parts.push(`- **${v.name}:** ${v.value} (${v.source})`);
  }
  parts.push("");
  parts.push("## Clinical Recommendation");
  parts.push(recommendation);
  parts.push("");
  parts.push("## References");
  for (const ref of formula.references) {
    parts.push(`- ${ref}`);
  }
  parts.push("");
  parts.push("*This estimate uses a simplified Pooled Cohort Equations model. For precise risk, use the official ACC ASCVD Risk Calculator.*");

  return parts.join("\n");
}

function calcCKDEPI(
  age: number,
  sex: string,
  labs: Observation[],
  formula: typeof RISK_SCORE_FORMULAS[string],
) {
  const variables: VariableUsed[] = [];
  const creatinine = findLabValue(labs, ["2160-0"]);

  variables.push({ name: "Age", value: age, source: "FHIR" });
  variables.push({ name: "Sex", value: sex, source: "FHIR" });
  variables.push({ name: "Serum Creatinine", value: creatinine ?? "Not available", source: creatinine ? "FHIR" : "assumed" });

  if (creatinine === null) {
    return [
      `# ${formula.fullName}`,
      `*${formula.description}*`,
      "",
      "## Unable to Calculate",
      "Serum creatinine value not available.",
      "",
      "## Variables Available",
      ...variables.map((v) => `- **${v.name}:** ${v.value} (${v.source})`),
    ].join("\n");
  }

  const egfr = calculateEGFR(creatinine, age, sex);
  const category = formula.categories.find(
    (c) => egfr >= c.min && egfr <= c.max,
  ) ?? formula.categories[formula.categories.length - 1];

  return [
    `# ${formula.fullName}`,
    `*${formula.description}*`,
    "",
    `## eGFR: ${egfr} mL/min/1.73m2`,
    `**CKD Stage:** ${category.label}`,
    "",
    "## Variables Used",
    ...variables.map((v) => `- **${v.name}:** ${v.value} (${v.source})`),
    "",
    "## Clinical Recommendation",
    category.recommendation,
    "",
    "## References",
    ...formula.references.map((r) => `- ${r}`),
    "",
    "*CKD-EPI 2021 (race-free) equation.*",
  ].join("\n");
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function hasCondition(conditions: Condition[], keywords: string[]): boolean {
  return conditions.some((c) => conditionMatchesKeywords(c, keywords));
}

function findLabByLoinc(
  labs: Observation[],
  loincCodes: string[],
): Observation | null {
  for (const obs of labs) {
    const code = getLoincCode(obs.code);
    if (code && loincCodes.includes(code)) return obs;
  }
  return null;
}

function findLabValue(
  labs: Observation[],
  loincCodes: string[],
): number | null {
  const obs = findLabByLoinc(labs, loincCodes);
  return obs?.valueQuantity?.value ?? null;
}

function getCategory(
  score: number,
  categories: { label: string; min: number; max: number; recommendation: string }[],
): { label: string; recommendation: string } {
  for (const cat of categories) {
    if (score >= cat.min && score <= cat.max) {
      return { label: cat.label, recommendation: cat.recommendation };
    }
  }
  return {
    label: "Unknown",
    recommendation: "Score does not match any defined category.",
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Simplified Pooled Cohort Equations computation.
 * Uses the White (non-Hispanic) coefficients as a general approximation.
 * Returns 10-year risk as a fraction (e.g. 0.1 = 10%).
 */
function computePooledCohortRisk(
  age: number,
  isFemale: boolean,
  totalChol: number,
  hdl: number,
  sbp: number,
  onBPTreatment: boolean,
  hasDM: boolean,
  isSmoker: boolean,
): number {
  // Coefficients for White females and males (from Goff et al. 2014)
  if (isFemale) {
    const lnAge = Math.log(age);
    const lnTC = Math.log(totalChol);
    const lnHDL = Math.log(hdl);
    const lnSBP = Math.log(sbp);
    const lnTreatedSBP = onBPTreatment ? lnSBP : 0;
    const lnUntreatedSBP = onBPTreatment ? 0 : lnSBP;

    const s = -29.799 * lnAge +
      4.884 * lnAge * lnAge +
      13.54 * lnTC +
      -3.114 * lnAge * lnTC +
      -13.578 * lnHDL +
      3.149 * lnAge * lnHDL +
      2.019 * lnTreatedSBP +
      1.957 * lnUntreatedSBP +
      7.574 * (isSmoker ? 1 : 0) +
      -1.665 * lnAge * (isSmoker ? 1 : 0) +
      0.661 * (hasDM ? 1 : 0);

    const baselineSurvival = 0.9665;
    const meanCoeff = -29.18;
    const risk = 1 - Math.pow(baselineSurvival, Math.exp(s - meanCoeff));
    return Math.max(0, Math.min(1, risk));
  } else {
    const lnAge = Math.log(age);
    const lnTC = Math.log(totalChol);
    const lnHDL = Math.log(hdl);
    const lnSBP = Math.log(sbp);
    const lnTreatedSBP = onBPTreatment ? lnSBP : 0;
    const lnUntreatedSBP = onBPTreatment ? 0 : lnSBP;

    const s = 12.344 * lnAge +
      11.853 * lnTC +
      -2.664 * lnAge * lnTC +
      -7.99 * lnHDL +
      1.769 * lnAge * lnHDL +
      1.797 * lnTreatedSBP +
      1.764 * lnUntreatedSBP +
      7.837 * (isSmoker ? 1 : 0) +
      -1.795 * lnAge * (isSmoker ? 1 : 0) +
      0.658 * (hasDM ? 1 : 0);

    const baselineSurvival = 0.9144;
    const meanCoeff = 61.18;
    const risk = 1 - Math.pow(baselineSurvival, Math.exp(s - meanCoeff));
    return Math.max(0, Math.min(1, risk));
  }
}
