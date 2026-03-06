import type { FHIRClient } from "../fhir/client.js";
import { getPatient } from "../fhir/queries/patient.js";
import { getConditions } from "../fhir/queries/conditions.js";
import { getActiveMedications } from "../fhir/queries/medications.js";
import { getRecentLabs, getRecentVitals } from "../fhir/queries/observations.js";
import { CLINICAL_GUIDELINES } from "../config/constants.js";
import type { ClinicalGuideline, GuidelineTarget } from "../config/constants.js";
import {
  getPatientAge,
  getPatientSex,
  formatHumanName,
  getCodeDisplay,
  getLoincCode,
  formatDate,
  conditionMatchesKeywords,
} from "../utils/fhir-helpers.js";
import type { Observation, Condition, MedicationRequest } from "../fhir/types.js";

export interface GuidelineMatcherInput {
  patientId?: string;
  condition?: string;
}

interface TargetAssessment {
  measure: string;
  target: string;
  currentValue: string | null;
  currentDate: string | null;
  atTarget: boolean | null; // null if no data
  gap: string;
}

interface MedicationAssessment {
  recommended: string;
  currentlyPrescribed: boolean;
  matchingMedication?: string;
}

interface MatchedGuideline {
  guideline: ClinicalGuideline;
  matchedConditions: string[];
  targetAssessments: TargetAssessment[];
  medicationAssessments: MedicationAssessment[];
  actionItems: string[];
}

export async function matchClinicalGuidelines(
  client: FHIRClient | null,
  input: GuidelineMatcherInput,
): Promise<string> {
  const matchedGuidelines: MatchedGuideline[] = [];

  let conditions: Condition[] = [];
  let medications: MedicationRequest[] = [];
  let labs: Observation[] = [];
  let vitals: Observation[] = [];
  let age = 0;
  let sex = "unknown";
  let patientName = "Unknown";

  if (input.patientId && client) {
    const patient = await getPatient(client, input.patientId);
    age = getPatientAge(patient);
    sex = getPatientSex(patient);
    patientName = patient.name?.length ? formatHumanName(patient.name[0]) : "Unknown";

    [conditions, medications, labs, vitals] = await Promise.all([
      getConditions(client, input.patientId),
      getActiveMedications(client, input.patientId),
      getRecentLabs(client, input.patientId, 365),
      getRecentVitals(client, input.patientId, 90),
    ]);

    // Match conditions to guidelines
    for (const guideline of CLINICAL_GUIDELINES) {
      const condKeywords = guideline.condition
        .toLowerCase()
        .split(/[\s/()]+/)
        .filter((k) => k.length > 2);

      const matchedConds = conditions.filter((c) =>
        conditionMatchesKeywords(c, condKeywords),
      );

      if (matchedConds.length > 0) {
        const matched = buildGuidelineMatch(
          guideline,
          matchedConds,
          medications,
          labs,
          vitals,
        );
        matchedGuidelines.push(matched);
      }
    }
  }

  // If condition string provided, also search guidelines by name
  if (input.condition) {
    const condLower = input.condition.toLowerCase();
    for (const guideline of CLINICAL_GUIDELINES) {
      const guidelineLower = guideline.condition.toLowerCase();
      if (
        guidelineLower.includes(condLower) ||
        condLower.includes(guidelineLower) ||
        condLower.split(/\s+/).some((w) => w.length > 2 && guidelineLower.includes(w))
      ) {
        // Avoid duplicates
        if (!matchedGuidelines.find((m) => m.guideline.id === guideline.id)) {
          const matched = buildGuidelineMatch(
            guideline,
            conditions.filter((c) =>
              conditionMatchesKeywords(
                c,
                guideline.condition.toLowerCase().split(/\s+/).filter((k) => k.length > 2),
              ),
            ),
            medications,
            labs,
            vitals,
          );
          matchedGuidelines.push(matched);
        }
      }
    }
  }

  // Format output
  const parts: string[] = [];
  parts.push("# Clinical Guideline Matching Report");
  if (input.patientId) {
    parts.push(`**Patient:** ${patientName} | Age: ${age} | Sex: ${capitalize(sex)}`);
  }
  if (input.condition) {
    parts.push(`**Condition Query:** ${input.condition}`);
  }
  parts.push("");

  if (matchedGuidelines.length === 0) {
    parts.push("No matching clinical guidelines found for the specified patient conditions or search term.");
    parts.push("");
    parts.push(`Available guidelines: ${CLINICAL_GUIDELINES.map((g) => g.condition).join(", ")}`);
    return parts.join("\n");
  }

  for (const match of matchedGuidelines) {
    const g = match.guideline;
    parts.push(`## ${g.condition}`);
    parts.push(`*Source: ${g.source}*`);
    parts.push("");

    if (match.matchedConditions.length > 0) {
      parts.push(
        `**Matched Conditions:** ${match.matchedConditions.join(", ")}`,
      );
      parts.push("");
    }

    // Treatment Targets
    parts.push("### Treatment Targets");
    parts.push("| Measure | Target | Current Value | Date | At Target? | Gap |");
    parts.push("|---------|--------|---------------|------|------------|-----|");
    for (const ta of match.targetAssessments) {
      const atTargetStr =
        ta.atTarget === null
          ? "No data"
          : ta.atTarget
            ? "YES"
            : "**NO**";
      parts.push(
        `| ${ta.measure} | ${ta.target} | ${ta.currentValue ?? "N/A"} | ${ta.currentDate ? formatDate(ta.currentDate) : "N/A"} | ${atTargetStr} | ${ta.gap} |`,
      );
    }
    parts.push("");

    // Medication Assessment
    parts.push("### Medication Assessment");
    parts.push(
      "| Recommended Medication | Currently Prescribed? | Matching Medication |",
    );
    parts.push("|------------------------|----------------------|---------------------|");
    for (const ma of match.medicationAssessments) {
      parts.push(
        `| ${ma.recommended} | ${ma.currentlyPrescribed ? "YES" : "No"} | ${ma.matchingMedication ?? "-"} |`,
      );
    }
    parts.push("");

    // Monitoring Schedule
    parts.push("### Monitoring Schedule");
    parts.push(g.monitoringSchedule);
    parts.push("");

    // Action Items
    if (match.actionItems.length > 0) {
      parts.push("### Action Items");
      for (const item of match.actionItems) {
        parts.push(`- ${item}`);
      }
      parts.push("");
    }

    parts.push("---");
    parts.push("");
  }

  parts.push(
    "*This guideline matching report is for clinical decision support only. Treatment decisions should incorporate patient preferences, comorbidities, and clinical context.*",
  );

  return parts.join("\n");
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildGuidelineMatch(
  guideline: ClinicalGuideline,
  matchedConditions: Condition[],
  medications: MedicationRequest[],
  labs: Observation[],
  vitals: Observation[],
): MatchedGuideline {
  const targetAssessments = assessTargets(guideline.targets, labs, vitals);
  const medicationAssessments = assessMedications(
    guideline.firstLineMedications,
    medications,
  );
  const actionItems = generateActionItems(
    guideline,
    targetAssessments,
    medicationAssessments,
  );

  return {
    guideline,
    matchedConditions: matchedConditions.map((c) => getCodeDisplay(c.code)),
    targetAssessments,
    medicationAssessments,
    actionItems,
  };
}

function assessTargets(
  targets: GuidelineTarget[],
  labs: Observation[],
  vitals: Observation[],
): TargetAssessment[] {
  const assessments: TargetAssessment[] = [];

  for (const target of targets) {
    let currentValue: string | null = null;
    let currentDate: string | null = null;
    let atTarget: boolean | null = null;

    if (target.loincCode) {
      // Find most recent lab with this LOINC code
      const obs = findObsByLoinc(labs, target.loincCode) ??
        findObsByLoinc(vitals, target.loincCode);

      if (obs?.valueQuantity?.value !== undefined) {
        currentValue = `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ""}`;
        currentDate = obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? null;
        atTarget = evaluateTarget(obs.valueQuantity.value, target.target);
      }
    } else if (target.measure.toLowerCase().includes("blood pressure")) {
      // Check vitals for BP
      const bp = findBP(vitals);
      if (bp) {
        currentValue = `${bp.systolic}/${bp.diastolic} mmHg`;
        currentDate = bp.date;
        // Parse target like "<130/80 mmHg"
        const bpTarget = target.target.match(/<?\s*(\d+)/);
        if (bpTarget) {
          atTarget = bp.systolic < parseInt(bpTarget[1]);
        }
      }
    } else if (target.measure.toLowerCase().includes("systolic")) {
      const bp = findBP(vitals);
      if (bp) {
        currentValue = `${bp.systolic} mmHg`;
        currentDate = bp.date;
        const numTarget = parseTargetNumber(target.target);
        if (numTarget !== null) {
          atTarget = bp.systolic < numTarget;
        }
      }
    } else if (target.measure.toLowerCase().includes("diastolic")) {
      const bp = findBP(vitals);
      if (bp) {
        currentValue = `${bp.diastolic} mmHg`;
        currentDate = bp.date;
        const numTarget = parseTargetNumber(target.target);
        if (numTarget !== null) {
          atTarget = bp.diastolic < numTarget;
        }
      }
    }

    let gap = "";
    if (atTarget === null) {
      gap = "No data available to assess";
    } else if (atTarget) {
      gap = "At target";
    } else {
      gap = `Not at target (current: ${currentValue}, target: ${target.target})`;
    }

    assessments.push({
      measure: target.measure,
      target: target.target,
      currentValue,
      currentDate,
      atTarget,
      gap,
    });
  }

  return assessments;
}

function assessMedications(
  recommendedMeds: string[],
  currentMeds: MedicationRequest[],
): MedicationAssessment[] {
  const assessments: MedicationAssessment[] = [];

  for (const rec of recommendedMeds) {
    // Extract drug names/classes from the recommendation string
    const recLower = rec.toLowerCase();

    let matchingMed: string | undefined;
    let prescribed = false;

    for (const med of currentMeds) {
      const medName = getCodeDisplay(med.medicationCodeableConcept).toLowerCase();

      // Try matching by checking if key words from the recommendation appear in the med name
      const recWords = recLower
        .split(/[\s,;:()+/]+/)
        .filter((w) => w.length > 3);

      const isMatch = recWords.some(
        (w) => medName.includes(w) || w.includes(medName.split(" ")[0]),
      );

      if (isMatch) {
        prescribed = true;
        matchingMed = getCodeDisplay(med.medicationCodeableConcept);
        break;
      }
    }

    assessments.push({
      recommended: rec,
      currentlyPrescribed: prescribed,
      matchingMedication: matchingMed,
    });
  }

  return assessments;
}

function generateActionItems(
  guideline: ClinicalGuideline,
  targets: TargetAssessment[],
  meds: MedicationAssessment[],
): string[] {
  const items: string[] = [];

  // Targets not met
  const notAtTarget = targets.filter((t) => t.atTarget === false);
  for (const t of notAtTarget) {
    items.push(
      `Address ${t.measure}: currently ${t.currentValue}, target is ${t.target}.`,
    );
  }

  // Missing data
  const noData = targets.filter((t) => t.atTarget === null && t.currentValue === null);
  for (const t of noData) {
    items.push(`Order ${t.measure} testing (no recent result available).`);
  }

  // Recommended meds not prescribed
  const notPrescribed = meds.filter((m) => !m.currentlyPrescribed);
  if (notPrescribed.length > 0) {
    items.push(
      `Consider initiating guideline-recommended therapy: ${notPrescribed.map((m) => m.recommended).join("; ")}`,
    );
  }

  if (items.length === 0) {
    items.push(
      `Continue current management. All assessed targets are met and guideline-recommended medications are prescribed.`,
    );
  }

  return items;
}

function findObsByLoinc(
  observations: Observation[],
  loincCode: string,
): Observation | null {
  for (const obs of observations) {
    const code = getLoincCode(obs.code);
    if (code === loincCode) return obs;
  }
  return null;
}

function findBP(
  vitals: Observation[],
): { systolic: number; diastolic: number; date: string } | null {
  for (const v of vitals) {
    const code = getLoincCode(v.code);
    const display = getCodeDisplay(v.code).toLowerCase();
    if (code === "85354-9" || display.includes("blood pressure")) {
      const sys = v.component?.find((c) => {
        const cc = getLoincCode(c.code);
        return cc === "8480-6" || getCodeDisplay(c.code).toLowerCase().includes("systolic");
      });
      const dia = v.component?.find((c) => {
        const cc = getLoincCode(c.code);
        return cc === "8462-4" || getCodeDisplay(c.code).toLowerCase().includes("diastolic");
      });
      if (sys?.valueQuantity?.value && dia?.valueQuantity?.value) {
        return {
          systolic: sys.valueQuantity.value,
          diastolic: dia.valueQuantity.value,
          date: v.effectiveDateTime ?? v.effectivePeriod?.start ?? "",
        };
      }
    }
  }
  return null;
}

function evaluateTarget(value: number, targetStr: string): boolean {
  // Parse target strings like "<7.0%", "<100 mg/dL", ">= 90", "80-130 mg/dL"
  const rangeMatch = targetStr.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    return value >= low && value <= high;
  }

  const ltMatch = targetStr.match(/<\s*(\d+\.?\d*)/);
  if (ltMatch) {
    return value < parseFloat(ltMatch[1]);
  }

  const lteMatch = targetStr.match(/<=\s*(\d+\.?\d*)/);
  if (lteMatch) {
    return value <= parseFloat(lteMatch[1]);
  }

  const gtMatch = targetStr.match(/>\s*(\d+\.?\d*)/);
  if (gtMatch) {
    return value > parseFloat(gtMatch[1]);
  }

  const gteMatch = targetStr.match(/>=\s*(\d+\.?\d*)/);
  if (gteMatch) {
    return value >= parseFloat(gteMatch[1]);
  }

  return false; // Cannot parse target
}

function parseTargetNumber(targetStr: string): number | null {
  const match = targetStr.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
