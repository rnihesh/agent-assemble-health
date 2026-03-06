import type { FHIRClient } from "../fhir/client.js";
import { getPatient } from "../fhir/queries/patient.js";
import { getConditions } from "../fhir/queries/conditions.js";
import { getImmunizations } from "../fhir/queries/immunizations.js";
import { getProcedures } from "../fhir/queries/procedures.js";
import { getRecentLabs, getRecentVitals } from "../fhir/queries/observations.js";
import {
  USPSTF_GUIDELINES,
  CDC_IMMUNIZATION_SCHEDULE,
  CLINICAL_GUIDELINES,
} from "../config/constants.js";
import {
  getPatientAge,
  getPatientSex,
  formatHumanName,
  getCodeDisplay,
  getLoincCode,
  formatDate,
  daysAgo,
  conditionMatchesKeywords,
} from "../utils/fhir-helpers.js";
import type { Observation, Procedure, Immunization, Condition } from "../fhir/types.js";

export interface CareGapInput {
  patientId: string;
}

interface CareGap {
  category: "Screening" | "Vaccination" | "Monitoring";
  recommendation: string;
  guidelineSource: string;
  grade?: string;
  lastPerformed?: string;
  dueDate?: string;
  priority: "HIGH" | "MODERATE" | "LOW";
  details?: string;
}

export async function identifyCareGaps(
  client: FHIRClient,
  input: CareGapInput,
): Promise<string> {
  const patient = await getPatient(client, input.patientId);
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);
  const name = patient.name?.length ? formatHumanName(patient.name[0]) : "Unknown";

  // Fetch all relevant data in parallel
  const [conditions, immunizations, procedures, labs, vitals] = await Promise.all([
    getConditions(client, input.patientId),
    getImmunizations(client, input.patientId),
    getProcedures(client, input.patientId),
    getRecentLabs(client, input.patientId, 730), // 2 years lookback
    getRecentVitals(client, input.patientId, 365),
  ]);

  const gaps: CareGap[] = [];

  // 1. Check USPSTF screening guidelines
  checkScreeningGaps(age, sex, conditions, procedures, labs, vitals, gaps);

  // 2. Check immunization gaps
  checkImmunizationGaps(age, immunizations, gaps);

  // 3. Check condition-specific monitoring gaps
  checkMonitoringGaps(age, sex, conditions, labs, vitals, gaps);

  // Sort by priority
  const priorityOrder: Record<string, number> = { HIGH: 0, MODERATE: 1, LOW: 2 };
  gaps.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

  // Build output
  const parts: string[] = [];
  parts.push("# Care Gap Analysis");
  parts.push(`**Patient:** ${name} | Age: ${age} | Sex: ${capitalize(sex)}`);
  parts.push("");

  if (gaps.length === 0) {
    parts.push("No care gaps identified based on available data and current guidelines.");
    parts.push("");
    parts.push("*Note: This analysis is based on structured data in the EHR. Gaps may exist in areas not captured electronically.*");
    return parts.join("\n");
  }

  parts.push(`**Total Gaps Identified:** ${gaps.length}`);
  parts.push("");

  // ── Overdue Screenings ─────────────────────────────────────────────────
  const screeningGaps = gaps.filter((g) => g.category === "Screening");
  if (screeningGaps.length > 0) {
    parts.push("## Overdue Screenings");
    parts.push("");
    for (const gap of screeningGaps) {
      parts.push(`### ${gap.recommendation}`);
      parts.push(`- **Priority:** ${gap.priority}`);
      parts.push(`- **Guideline:** ${gap.guidelineSource}`);
      if (gap.grade) parts.push(`- **Grade:** ${gap.grade}`);
      if (gap.lastPerformed) parts.push(`- **Last Performed:** ${gap.lastPerformed}`);
      if (gap.dueDate) parts.push(`- **Due:** ${gap.dueDate}`);
      if (gap.details) parts.push(`- **Details:** ${gap.details}`);
      parts.push("");
    }
  }

  // ── Vaccination Gaps ───────────────────────────────────────────────────
  const vaccGaps = gaps.filter((g) => g.category === "Vaccination");
  if (vaccGaps.length > 0) {
    parts.push("## Vaccination Gaps");
    parts.push("");
    for (const gap of vaccGaps) {
      parts.push(`### ${gap.recommendation}`);
      parts.push(`- **Priority:** ${gap.priority}`);
      parts.push(`- **Guideline:** ${gap.guidelineSource}`);
      if (gap.lastPerformed) parts.push(`- **Last Administered:** ${gap.lastPerformed}`);
      if (gap.dueDate) parts.push(`- **Due:** ${gap.dueDate}`);
      if (gap.details) parts.push(`- **Details:** ${gap.details}`);
      parts.push("");
    }
  }

  // ── Monitoring Gaps ────────────────────────────────────────────────────
  const monitorGaps = gaps.filter((g) => g.category === "Monitoring");
  if (monitorGaps.length > 0) {
    parts.push("## Condition-Specific Monitoring Gaps");
    parts.push("");
    for (const gap of monitorGaps) {
      parts.push(`### ${gap.recommendation}`);
      parts.push(`- **Priority:** ${gap.priority}`);
      parts.push(`- **Guideline:** ${gap.guidelineSource}`);
      if (gap.lastPerformed) parts.push(`- **Last Performed:** ${gap.lastPerformed}`);
      if (gap.dueDate) parts.push(`- **Due:** ${gap.dueDate}`);
      if (gap.details) parts.push(`- **Details:** ${gap.details}`);
      parts.push("");
    }
  }

  parts.push("---");
  parts.push("*This care gap analysis is for clinical decision support. Always consider individual patient circumstances, preferences, and shared decision-making.*");

  return parts.join("\n");
}

// ── Screening gap checker ────────────────────────────────────────────────────

function checkScreeningGaps(
  age: number,
  sex: string,
  conditions: Condition[],
  procedures: Procedure[],
  labs: Observation[],
  vitals: Observation[],
  gaps: CareGap[],
): void {
  for (const guideline of USPSTF_GUIDELINES) {
    // Check age applicability
    if (age < guideline.ageRange.min || age > guideline.ageRange.max) continue;

    // Check sex applicability
    if (guideline.sexApplicable !== "all" && guideline.sexApplicable !== sex) continue;

    // Skip low-evidence / insufficient (Grade I) unless it's a common screening
    if (guideline.grade === "D") continue;

    // Determine if screening was performed
    const lastPerformed = findLastScreening(
      guideline,
      procedures,
      labs,
      vitals,
    );

    const frequencyDays = estimateFrequencyDays(guideline.frequency);
    let isOverdue = false;

    if (lastPerformed === null) {
      // Never performed
      isOverdue = true;
    } else if (frequencyDays > 0) {
      const daysSince = daysAgo(lastPerformed);
      isOverdue = daysSince > frequencyDays;
    }

    if (isOverdue) {
      const priority = guideline.grade === "A" ? "HIGH" : guideline.grade === "B" ? "MODERATE" : "LOW";
      gaps.push({
        category: "Screening",
        recommendation: `${guideline.condition} Screening: ${guideline.recommendation}`,
        guidelineSource: `USPSTF Grade ${guideline.grade}`,
        grade: guideline.grade,
        lastPerformed: lastPerformed ? formatDate(lastPerformed) : "No record found",
        dueDate: lastPerformed && frequencyDays > 0
          ? formatDate(addDays(lastPerformed, frequencyDays))
          : "Now",
        priority,
        details: guideline.conditionSpecific ?? undefined,
      });
    }
  }
}

// ── Immunization gap checker ─────────────────────────────────────────────────

function checkImmunizationGaps(
  age: number,
  immunizations: Immunization[],
  gaps: CareGap[],
): void {
  for (const schedule of CDC_IMMUNIZATION_SCHEDULE) {
    if (age < schedule.ageRange.min || age > schedule.ageRange.max) continue;

    const matchingImmunizations = immunizations.filter((imm) => {
      const vaccineName = getCodeDisplay(imm.vaccineCode).toLowerCase();
      const scheduleVaccine = schedule.vaccine.toLowerCase();

      // Try to match by vaccine name keywords
      const keywords = scheduleVaccine.split(/[\s/()]+/).filter((k) => k.length > 2);
      return keywords.some((kw) => vaccineName.includes(kw));
    });

    let isGap = false;
    let lastDate: string | null = null;

    if (matchingImmunizations.length === 0) {
      isGap = true;
    } else {
      // Sort by date descending
      matchingImmunizations.sort((a, b) => {
        const da = a.occurrenceDateTime ?? "";
        const db = b.occurrenceDateTime ?? "";
        return db.localeCompare(da);
      });

      lastDate = matchingImmunizations[0].occurrenceDateTime ?? null;

      // Check if it's a recurring vaccine (e.g., influenza annually, Td every 10 years)
      if (schedule.frequency.toLowerCase().includes("annual")) {
        if (lastDate && daysAgo(lastDate) > 365) isGap = true;
      } else if (schedule.frequency.toLowerCase().includes("10 year")) {
        if (lastDate && daysAgo(lastDate) > 3650) isGap = true;
      }
    }

    if (isGap) {
      const priority = schedule.vaccine.toLowerCase().includes("influenza") ||
        schedule.vaccine.toLowerCase().includes("covid")
        ? "MODERATE"
        : "LOW";

      gaps.push({
        category: "Vaccination",
        recommendation: `${schedule.vaccine}: ${schedule.frequency}`,
        guidelineSource: "CDC Adult Immunization Schedule",
        lastPerformed: lastDate ? formatDate(lastDate) : "No record found",
        dueDate: "Now",
        priority,
        details: schedule.conditions ?? undefined,
      });
    }
  }
}

// ── Condition-specific monitoring gap checker ────────────────────────────────

function checkMonitoringGaps(
  age: number,
  sex: string,
  conditions: Condition[],
  labs: Observation[],
  vitals: Observation[],
  gaps: CareGap[],
): void {
  for (const guideline of CLINICAL_GUIDELINES) {
    // Check if patient has this condition
    const conditionKeywords = guideline.condition
      .toLowerCase()
      .split(/[\s/()]+/)
      .filter((k) => k.length > 2);

    const hasCondition = conditions.some((c) =>
      conditionMatchesKeywords(c, conditionKeywords),
    );
    if (!hasCondition) continue;

    // Check each target that has a LOINC code
    for (const target of guideline.targets) {
      if (!target.loincCode) continue;

      const lastObs = findMostRecentLab(labs, target.loincCode);

      if (lastObs === null) {
        gaps.push({
          category: "Monitoring",
          recommendation: `${guideline.condition}: ${target.measure} monitoring needed (target: ${target.target})`,
          guidelineSource: guideline.source,
          lastPerformed: "No recent result found",
          dueDate: "Now",
          priority: "HIGH",
          details: `Part of ${guideline.condition} management per ${guideline.source}. Monitoring schedule: ${guideline.monitoringSchedule}`,
        });
      } else {
        const obsDate = lastObs.effectiveDateTime ?? lastObs.effectivePeriod?.start ?? "";
        const daysSinceObs = daysAgo(obsDate);

        // Consider overdue if > 180 days for most labs (adjust based on guideline)
        const thresholdDays = guideline.monitoringSchedule.toLowerCase().includes("every 3 month")
          ? 120
          : guideline.monitoringSchedule.toLowerCase().includes("every 6 month")
            ? 210
            : guideline.monitoringSchedule.toLowerCase().includes("annual")
              ? 400
              : 210;

        if (daysSinceObs > thresholdDays) {
          gaps.push({
            category: "Monitoring",
            recommendation: `${guideline.condition}: ${target.measure} is overdue (target: ${target.target})`,
            guidelineSource: guideline.source,
            lastPerformed: formatDate(obsDate),
            dueDate: formatDate(addDays(obsDate, thresholdDays)),
            priority: "MODERATE",
            details: `Last result: ${lastObs.valueQuantity?.value ?? "N/A"} ${lastObs.valueQuantity?.unit ?? ""}. Monitoring schedule: ${guideline.monitoringSchedule}`,
          });
        }
      }
    }
  }
}

// ── Utility helpers ──────────────────────────────────────────────────────────

function findLastScreening(
  guideline: typeof USPSTF_GUIDELINES[number],
  procedures: Procedure[],
  labs: Observation[],
  vitals: Observation[],
): string | null {
  const conditionLower = guideline.condition.toLowerCase();

  // Check procedures for matching screenings
  for (const proc of procedures) {
    const display = getCodeDisplay(proc.code).toLowerCase();
    if (
      display.includes(conditionLower) ||
      conditionLower.split(" ").some((w) => w.length > 3 && display.includes(w))
    ) {
      return proc.performedDateTime ?? proc.performedPeriod?.start ?? null;
    }
  }

  // For certain screenings, check lab/observation records
  // Map common screenings to LOINC codes or observation types
  const screeningLabMap: Record<string, string[]> = {
    "hypertension": ["85354-9"], // Blood pressure
    "lipid disorders": ["2093-3", "2089-1", "2085-9", "2571-8"],
    "prediabetes and type 2 diabetes": ["4548-4", "2345-7"],
    "depression": [], // PHQ-9 - would need specific code
    "obesity": [], // BMI
    "hepatitis c": [],
    "hiv": [],
  };

  const relevantLoincs = screeningLabMap[conditionLower] ?? [];
  for (const loinc of relevantLoincs) {
    const obs = findMostRecentLab(labs, loinc);
    if (obs) {
      return obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? null;
    }
  }

  // Check vitals for blood pressure
  if (conditionLower.includes("hypertension")) {
    for (const v of vitals) {
      const code = getLoincCode(v.code);
      if (code === "85354-9" || getCodeDisplay(v.code).toLowerCase().includes("blood pressure")) {
        return v.effectiveDateTime ?? v.effectivePeriod?.start ?? null;
      }
    }
  }

  return null;
}

function findMostRecentLab(labs: Observation[], loincCode: string): Observation | null {
  for (const lab of labs) {
    const code = getLoincCode(lab.code);
    if (code === loincCode) return lab; // Labs are already sorted by -date
  }
  return null;
}

function estimateFrequencyDays(frequency: string): number {
  const lower = frequency.toLowerCase();
  if (lower.includes("annual") || lower.includes("every year") || lower.includes("every 1 year")) return 365;
  if (lower.includes("every 2 year") || lower.includes("bienni")) return 730;
  if (lower.includes("every 3 year")) return 1095;
  if (lower.includes("every 5 year")) return 1825;
  if (lower.includes("every 10 year")) return 3650;
  if (lower.includes("one-time") || lower.includes("once")) return 0; // Not recurring
  if (lower.includes("every visit")) return 180; // Approximate
  return 365; // Default to annual
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
