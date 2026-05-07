import type { FHIRClient } from "../fhir/client.js";
import { getPatient } from "../fhir/queries/patient.js";
import { getRecentLabs } from "../fhir/queries/observations.js";
import { LAB_REFERENCE_RANGES } from "../config/constants.js";
import {
  getPatientAge,
  getPatientSex,
  getCodeDisplay,
  getLoincCode,
  formatDate,
  calculateEGFR,
  calculateAnionGap,
  formatResourceRefParts,
} from "../utils/fhir-helpers.js";
import type { Observation } from "../fhir/types.js";

export interface LabInterpreterInput {
  patientId: string;
  lookbackDays?: number;
}

type FlagLevel = "CRITICAL LOW" | "CRITICAL HIGH" | "LOW" | "HIGH" | "NORMAL";

interface InterpretedLab {
  name: string;
  loincCode: string | null;
  value: number;
  unit: string;
  flag: FlagLevel;
  normalRange: string;
  date: string;
  observationId?: string;
}

interface LabTrend {
  name: string;
  values: { value: number; date: string }[];
  direction: "improving" | "worsening" | "stable" | "indeterminate";
  flag: FlagLevel;
}

interface CalculatedValue {
  name: string;
  value: number;
  unit: string;
  interpretation: string;
}

export async function interpretLabResults(
  client: FHIRClient,
  input: LabInterpreterInput,
): Promise<string> {
  const lookback = input.lookbackDays ?? 90;
  const patient = await getPatient(client, input.patientId);
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);
  const labs = await getRecentLabs(client, input.patientId, lookback);

  if (labs.length === 0) {
    return `# Lab Results Interpretation\n\nNo laboratory results found in the last ${lookback} days for this patient.`;
  }

  // Interpret each lab
  const interpreted = interpretLabs(labs, age, sex);

  // Identify trends
  const trends = identifyTrends(labs, age, sex);

  // Calculate derived values
  const calculated = computeDerivedValues(labs, age, sex);

  // Build output
  const parts: string[] = [];
  parts.push("# Lab Results Interpretation");
  parts.push(`*Patient age: ${age} | Sex: ${capitalize(sex)} | Lookback: ${lookback} days*`);
  parts.push("");

  // ── CRITICAL values ────────────────────────────────────────────────────
  const criticals = interpreted.filter(
    (l) => l.flag === "CRITICAL LOW" || l.flag === "CRITICAL HIGH",
  );
  if (criticals.length > 0) {
    parts.push("## CRITICAL VALUES - IMMEDIATE ATTENTION REQUIRED");
    parts.push("");
    for (const c of criticals) {
      parts.push(
        `- **${c.name}:** ${c.value} ${c.unit} [**${c.flag}**] (Normal: ${c.normalRange}) - ${formatDate(c.date)}${formatResourceRefParts("Observation", c.observationId)}`,
      );
    }
    parts.push("");
    parts.push(
      "*Critical values require immediate clinical review and potential intervention.*",
    );
    parts.push("");
  }

  // ── Abnormal results ──────────────────────────────────────────────────
  const abnormals = interpreted.filter(
    (l) => l.flag === "LOW" || l.flag === "HIGH",
  );
  if (abnormals.length > 0) {
    parts.push("## Abnormal Results");
    parts.push("");
    parts.push("| Test | Value | Units | Flag | Normal Range | Date | Source |");
    parts.push("|------|-------|-------|------|--------------|------|--------|");
    for (const a of abnormals) {
      const ref = formatResourceRefParts("Observation", a.observationId).trimStart();
      parts.push(
        `| ${a.name} | ${a.value} | ${a.unit} | **${a.flag}** | ${a.normalRange} | ${formatDate(a.date)} | ${ref} |`,
      );
    }
    parts.push("");
  }

  // ── Trends ─────────────────────────────────────────────────────────────
  const significantTrends = trends.filter(
    (t) => t.direction !== "stable" && t.direction !== "indeterminate",
  );
  if (significantTrends.length > 0) {
    parts.push("## Trends");
    parts.push("");
    for (const t of significantTrends) {
      const arrow =
        t.direction === "improving" ? "Improving" : t.direction === "worsening" ? "WORSENING" : "Stable";
      const sparkline = renderSparkline(t.values.map((v) => v.value));
      const valueList = t.values
        .map((v) => `${v.value} (${formatDate(v.date)})`)
        .join(" -> ");
      parts.push(`- **${t.name}:** ${arrow} \`${sparkline}\` -- ${valueList}`);
    }
    parts.push("");
  }

  // ── Calculated values ──────────────────────────────────────────────────
  if (calculated.length > 0) {
    parts.push("## Calculated / Derived Values");
    parts.push("");
    for (const cv of calculated) {
      parts.push(`- **${cv.name}:** ${cv.value} ${cv.unit} -- ${cv.interpretation}`);
    }
    parts.push("");
  }

  // ── Normal results ─────────────────────────────────────────────────────
  const normals = interpreted.filter((l) => l.flag === "NORMAL");
  if (normals.length > 0) {
    parts.push("## Normal Results");
    parts.push("");
    const normalNames = [...new Set(normals.map((n) => n.name))];
    parts.push(
      `The following labs are within normal limits: ${normalNames.join(", ")}.`,
    );
    parts.push("");
  }

  parts.push("---");
  parts.push(
    "*This interpretation is for clinical decision support only. Reference ranges may vary by laboratory. Always correlate with clinical context.*",
  );

  return parts.join("\n");
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Render a Unicode sparkline for a series of numeric values. Uses the
 * eight block-fill characters (▁▂▃▄▅▆▇█) so a clinician scanning the
 * trend section sees the shape at a glance — the prose value list still
 * follows for the actual numbers. Two or fewer values render as flat.
 */
function renderSparkline(values: number[]): string {
  if (values.length < 2) return "—";
  const blocks = "▁▂▃▄▅▆▇█";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return blocks[3].repeat(values.length);
  return values
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (blocks.length - 1));
      return blocks[idx];
    })
    .join("");
}

function interpretLabs(
  labs: Observation[],
  age: number,
  sex: string,
): InterpretedLab[] {
  const results: InterpretedLab[] = [];
  // Deduplicate: take the most recent result per LOINC code
  const seen = new Set<string>();

  for (const obs of labs) {
    const loincCode = getLoincCode(obs.code);
    const value = obs.valueQuantity?.value;
    if (value === undefined) continue;

    const key = loincCode ?? getCodeDisplay(obs.code);
    if (seen.has(key)) continue;
    seen.add(key);

    const name = getCodeDisplay(obs.code);
    const unit = obs.valueQuantity?.unit ?? "";
    const date = obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? "";

    const { flag, normalRange } = evaluateValue(loincCode, value, age, sex);

    results.push({
      name,
      loincCode,
      value,
      unit,
      flag,
      normalRange,
      date,
      observationId: obs.id,
    });
  }

  return results;
}

function evaluateValue(
  loincCode: string | null,
  value: number,
  age: number,
  sex: string,
): { flag: FlagLevel; normalRange: string } {
  if (!loincCode || !LAB_REFERENCE_RANGES[loincCode]) {
    return { flag: "NORMAL", normalRange: "N/A" };
  }

  const ref = LAB_REFERENCE_RANGES[loincCode];
  let low = ref.normalRange.low;
  let high = ref.normalRange.high;

  if (ref.sexSpecific) {
    const sexRange = ref.sexSpecific.find((s) => s.sex === sex);
    if (sexRange) {
      low = sexRange.low;
      high = sexRange.high;
    }
  }

  if (ref.ageSpecific) {
    const ageRange = ref.ageSpecific.find(
      (a) => age >= a.ageMin && age <= a.ageMax,
    );
    if (ageRange) {
      low = ageRange.low;
      high = ageRange.high;
    }
  }

  const normalRange = `${low}-${high} ${ref.unit}`;

  if (ref.criticalLow !== undefined && value <= ref.criticalLow) {
    return { flag: "CRITICAL LOW", normalRange };
  }
  if (ref.criticalHigh !== undefined && value >= ref.criticalHigh) {
    return { flag: "CRITICAL HIGH", normalRange };
  }
  if (value < low) return { flag: "LOW", normalRange };
  if (value > high) return { flag: "HIGH", normalRange };
  return { flag: "NORMAL", normalRange };
}

function identifyTrends(
  labs: Observation[],
  age: number,
  sex: string,
): LabTrend[] {
  // Group labs by LOINC code
  const grouped = new Map<string, { name: string; values: { value: number; date: string }[] }>();

  for (const obs of labs) {
    const loincCode = getLoincCode(obs.code);
    const value = obs.valueQuantity?.value;
    const date = obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? "";
    if (!loincCode || value === undefined) continue;

    if (!grouped.has(loincCode)) {
      grouped.set(loincCode, {
        name: getCodeDisplay(obs.code),
        values: [],
      });
    }
    grouped.get(loincCode)!.values.push({ value, date });
  }

  const trends: LabTrend[] = [];

  for (const [loincCode, group] of grouped.entries()) {
    if (group.values.length < 2) continue;

    // Sort by date ascending
    group.values.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const firstVal = group.values[0].value;
    const lastVal = group.values[group.values.length - 1].value;

    // Determine if the trend is improving or worsening based on reference ranges
    const ref = LAB_REFERENCE_RANGES[loincCode];
    let direction: LabTrend["direction"] = "indeterminate";

    if (ref) {
      let low = ref.normalRange.low;
      let high = ref.normalRange.high;
      if (ref.sexSpecific) {
        const sr = ref.sexSpecific.find((s) => s.sex === sex);
        if (sr) { low = sr.low; high = sr.high; }
      }
      const mid = (low + high) / 2;
      const changePercent = Math.abs((lastVal - firstVal) / firstVal) * 100;

      if (changePercent < 5) {
        direction = "stable";
      } else {
        // Improving = moving toward the middle of the normal range
        const firstDist = Math.abs(firstVal - mid);
        const lastDist = Math.abs(lastVal - mid);

        if (lastDist < firstDist) {
          direction = "improving";
        } else {
          direction = "worsening";
        }
      }
    }

    const { flag } = evaluateValue(loincCode, lastVal, age, sex);

    trends.push({
      name: group.name,
      values: group.values,
      direction,
      flag,
    });
  }

  return trends;
}

function computeDerivedValues(
  labs: Observation[],
  age: number,
  sex: string,
): CalculatedValue[] {
  const calculated: CalculatedValue[] = [];
  const labMap = new Map<string, number>();

  for (const obs of labs) {
    const loincCode = getLoincCode(obs.code);
    const value = obs.valueQuantity?.value;
    if (loincCode && value !== undefined && !labMap.has(loincCode)) {
      labMap.set(loincCode, value);
    }
  }

  // eGFR from creatinine
  const creatinine = labMap.get("2160-0");
  if (creatinine !== undefined) {
    const egfr = calculateEGFR(creatinine, age, sex);
    let interp = "";
    if (egfr >= 90) interp = "G1 - Normal or high kidney function";
    else if (egfr >= 60) interp = "G2 - Mildly decreased kidney function";
    else if (egfr >= 45) interp = "G3a - Mild to moderate decrease";
    else if (egfr >= 30) interp = "G3b - Moderate to severe decrease";
    else if (egfr >= 15) interp = "G4 - Severely decreased";
    else interp = "G5 - Kidney failure";

    calculated.push({
      name: "Estimated GFR (CKD-EPI 2021)",
      value: egfr,
      unit: "mL/min/1.73m2",
      interpretation: interp,
    });
  }

  // Anion Gap
  const sodium = labMap.get("2951-2");
  const chloride = labMap.get("2075-0");
  const bicarb = labMap.get("2028-9");
  if (sodium !== undefined && chloride !== undefined && bicarb !== undefined) {
    const ag = calculateAnionGap(sodium, chloride, bicarb);
    let interp = "Normal (8-12 mEq/L)";
    if (ag > 12) interp = "Elevated - consider MUDPILES causes (Methanol, Uremia, DKA, Propylene glycol, INH/Iron, Lactic acidosis, Ethylene glycol, Salicylates)";
    else if (ag < 8) interp = "Low - consider hypoalbuminemia, lithium, bromide";

    calculated.push({
      name: "Anion Gap",
      value: ag,
      unit: "mEq/L",
      interpretation: interp,
    });
  }

  // Calculated LDL (Friedewald) if direct LDL not available
  const totalChol = labMap.get("2093-3");
  const hdl = labMap.get("2085-9");
  const trig = labMap.get("2571-8");
  const directLDL = labMap.get("2089-1");
  if (
    totalChol !== undefined &&
    hdl !== undefined &&
    trig !== undefined &&
    directLDL === undefined &&
    trig < 400
  ) {
    const calcLDL = Math.round(totalChol - hdl - trig / 5);
    let interp = "";
    if (calcLDL < 70) interp = "Optimal for high-risk patients";
    else if (calcLDL < 100) interp = "Near optimal / desirable";
    else if (calcLDL < 130) interp = "Borderline high";
    else if (calcLDL < 160) interp = "High";
    else interp = "Very high";

    calculated.push({
      name: "Calculated LDL (Friedewald)",
      value: calcLDL,
      unit: "mg/dL",
      interpretation: interp,
    });
  }

  // BUN/Creatinine ratio
  const bun = labMap.get("3094-0");
  if (bun !== undefined && creatinine !== undefined && creatinine > 0) {
    const ratio = Math.round((bun / creatinine) * 10) / 10;
    let interp = "Normal (10-20:1)";
    if (ratio > 20) interp = "Elevated - consider pre-renal azotemia, GI bleeding, high protein diet, catabolic state";
    else if (ratio < 10) interp = "Low - consider liver disease, malnutrition, SIADH";

    calculated.push({
      name: "BUN/Creatinine Ratio",
      value: ratio,
      unit: ":1",
      interpretation: interp,
    });
  }

  return calculated;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
