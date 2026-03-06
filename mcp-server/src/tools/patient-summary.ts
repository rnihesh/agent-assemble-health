import type { FHIRClient } from "../fhir/client.js";
import { getPatient } from "../fhir/queries/patient.js";
import { getConditions } from "../fhir/queries/conditions.js";
import { getActiveMedications } from "../fhir/queries/medications.js";
import { getAllergies } from "../fhir/queries/allergies.js";
import { getRecentLabs, getRecentVitals } from "../fhir/queries/observations.js";
import { getImmunizations } from "../fhir/queries/immunizations.js";
import {
  getPatientAge,
  getPatientSex,
  formatHumanName,
  getCodeDisplay,
  getLoincCode,
  formatDate,
  calculateBMI,
} from "../utils/fhir-helpers.js";
import { LAB_REFERENCE_RANGES } from "../config/constants.js";
import type { Observation, Patient } from "../fhir/types.js";

export type SummarySection =
  | "demographics"
  | "conditions"
  | "medications"
  | "allergies"
  | "labs"
  | "vitals"
  | "immunizations";

const ALL_SECTIONS: SummarySection[] = [
  "demographics",
  "conditions",
  "medications",
  "allergies",
  "labs",
  "vitals",
  "immunizations",
];

export interface PatientSummaryInput {
  patientId: string;
  sections?: SummarySection[];
}

export async function patientSummary(
  client: FHIRClient,
  input: PatientSummaryInput,
): Promise<string> {
  const sections = input.sections?.length ? input.sections : ALL_SECTIONS;
  const parts: string[] = [];

  // Always fetch the patient resource (needed by several sections)
  const patient = await getPatient(client, input.patientId);
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);

  parts.push(`# Patient Summary`);
  parts.push("");

  // ── Demographics ─────────────────────────────────────────────────────────
  if (sections.includes("demographics")) {
    parts.push("## Demographics");
    const name = patient.name?.length ? formatHumanName(patient.name[0]) : "Unknown";
    parts.push(`- **Name:** ${name}`);
    parts.push(`- **Date of Birth:** ${formatDate(patient.birthDate)}`);
    parts.push(`- **Age:** ${age} years`);
    parts.push(`- **Sex:** ${capitalize(sex)}`);

    const addr = patient.address?.[0];
    if (addr) {
      const line = [
        ...(addr.line ?? []),
        addr.city,
        addr.state,
        addr.postalCode,
        addr.country,
      ]
        .filter(Boolean)
        .join(", ");
      parts.push(`- **Address:** ${line}`);
    }

    const phone = patient.telecom?.find((t) => t.system === "phone");
    if (phone?.value) {
      parts.push(`- **Phone:** ${phone.value}`);
    }
    const email = patient.telecom?.find((t) => t.system === "email");
    if (email?.value) {
      parts.push(`- **Email:** ${email.value}`);
    }
    parts.push("");
  }

  // ── Active Conditions ────────────────────────────────────────────────────
  if (sections.includes("conditions")) {
    parts.push("## Active Conditions");
    const conditions = await getConditions(client, input.patientId);
    if (conditions.length === 0) {
      parts.push("No active conditions on record.");
    } else {
      for (const c of conditions) {
        const display = getCodeDisplay(c.code);
        const onset = c.onsetDateTime ? ` (onset: ${formatDate(c.onsetDateTime)})` : "";
        parts.push(`- ${display}${onset}`);
      }
    }
    parts.push("");
  }

  // ── Current Medications ──────────────────────────────────────────────────
  if (sections.includes("medications")) {
    parts.push("## Current Medications");
    const meds = await getActiveMedications(client, input.patientId);
    if (meds.length === 0) {
      parts.push("No active medications on record.");
    } else {
      for (const m of meds) {
        const name = getCodeDisplay(m.medicationCodeableConcept);
        const dosage = m.dosageInstruction?.[0]?.text ?? "";
        const authored = m.authoredOn ? ` | Prescribed: ${formatDate(m.authoredOn)}` : "";
        const requester = m.requester?.display ? ` | By: ${m.requester.display}` : "";
        parts.push(`- **${name}** ${dosage}${authored}${requester}`);
      }
    }
    parts.push("");
  }

  // ── Allergies ────────────────────────────────────────────────────────────
  if (sections.includes("allergies")) {
    parts.push("## Allergies");
    const allergies = await getAllergies(client, input.patientId);
    if (allergies.length === 0) {
      parts.push("No known allergies on record.");
    } else {
      for (const a of allergies) {
        const allergen = getCodeDisplay(a.code);
        const reactions = a.reaction
          ?.map(
            (r) =>
              r.manifestation
                ?.map((m) => getCodeDisplay(m))
                .join(", ") ?? "",
          )
          .filter(Boolean)
          .join("; ");
        const severity = a.criticality ? ` [Criticality: ${a.criticality}]` : "";
        const reactionText = reactions ? ` - Reactions: ${reactions}` : "";
        parts.push(`- **${allergen}**${severity}${reactionText}`);
      }
    }
    parts.push("");
  }

  // ── Recent Labs ──────────────────────────────────────────────────────────
  if (sections.includes("labs")) {
    parts.push("## Recent Lab Results (Last 90 Days)");
    const labs = await getRecentLabs(client, input.patientId, 90);
    if (labs.length === 0) {
      parts.push("No recent lab results.");
    } else {
      parts.push("| Test | Value | Units | Flag | Date |");
      parts.push("|------|-------|-------|------|------|");
      for (const obs of labs) {
        const name = getCodeDisplay(obs.code);
        const value = obs.valueQuantity?.value?.toString() ?? obs.valueString ?? getCodeDisplay(obs.valueCodeableConcept) ?? "N/A";
        const units = obs.valueQuantity?.unit ?? "";
        const flag = getLabFlag(obs, age, sex);
        const date = formatDate(obs.effectiveDateTime ?? obs.effectivePeriod?.start);
        parts.push(`| ${name} | ${value} | ${units} | ${flag} | ${date} |`);
      }
    }
    parts.push("");
  }

  // ── Vitals ───────────────────────────────────────────────────────────────
  if (sections.includes("vitals")) {
    parts.push("## Latest Vitals");
    const vitals = await getRecentVitals(client, input.patientId, 90);
    if (vitals.length === 0) {
      parts.push("No recent vital signs.");
    } else {
      const vitalMap = buildLatestVitals(vitals);
      const bp = extractBP(vitals);
      if (bp) parts.push(`- **Blood Pressure:** ${bp}`);
      if (vitalMap["Heart rate"]) parts.push(`- **Heart Rate:** ${vitalMap["Heart rate"]}`);
      if (vitalMap["Body temperature"]) parts.push(`- **Temperature:** ${vitalMap["Body temperature"]}`);
      if (vitalMap["Body Weight"] || vitalMap["Body weight"]) parts.push(`- **Weight:** ${vitalMap["Body Weight"] ?? vitalMap["Body weight"]}`);
      if (vitalMap["Body Height"] || vitalMap["Body height"]) parts.push(`- **Height:** ${vitalMap["Body Height"] ?? vitalMap["Body height"]}`);

      const weight = extractNumericVital(vitals, ["29463-7", "body weight"]);
      const height = extractNumericVital(vitals, ["8302-2", "body height"]);
      if (weight && height) {
        const bmi = calculateBMI(weight, height);
        parts.push(`- **BMI:** ${bmi} kg/m2`);
      }
    }
    parts.push("");
  }

  // ── Immunizations ────────────────────────────────────────────────────────
  if (sections.includes("immunizations")) {
    parts.push("## Immunizations");
    const immunizations = await getImmunizations(client, input.patientId);
    if (immunizations.length === 0) {
      parts.push("No immunization records found.");
    } else {
      for (const i of immunizations) {
        const vaccine = getCodeDisplay(i.vaccineCode);
        const date = formatDate(i.occurrenceDateTime ?? i.occurrenceString);
        const status = i.status ?? "";
        parts.push(`- ${vaccine} | ${date} | ${status}`);
      }
    }
    parts.push("");
  }

  return parts.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getLabFlag(obs: Observation, age: number, sex: string): string {
  const loincCode = getLoincCode(obs.code);
  const value = obs.valueQuantity?.value;
  if (value === undefined || loincCode === null) return "";

  const ref = LAB_REFERENCE_RANGES[loincCode];
  if (!ref) return "";

  // Determine applicable range
  let low = ref.normalRange.low;
  let high = ref.normalRange.high;

  if (ref.sexSpecific) {
    const sexRange = ref.sexSpecific.find(
      (s) => s.sex === sex,
    );
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

  // Check critical ranges first
  if (ref.criticalLow !== undefined && value <= ref.criticalLow) return "**CRITICAL LOW**";
  if (ref.criticalHigh !== undefined && value >= ref.criticalHigh) return "**CRITICAL HIGH**";
  if (value < low) return "LOW";
  if (value > high) return "HIGH";
  return "Normal";
}

function buildLatestVitals(vitals: Observation[]): Record<string, string> {
  const map: Record<string, string> = {};
  // Take the first occurrence of each vital (already sorted by -date)
  for (const v of vitals) {
    const display = getCodeDisplay(v.code);
    if (!map[display] && v.valueQuantity?.value !== undefined) {
      map[display] = `${v.valueQuantity.value} ${v.valueQuantity.unit ?? ""}`;
    }
  }
  return map;
}

function extractBP(vitals: Observation[]): string | null {
  // BP observations may use components (systolic + diastolic)
  for (const v of vitals) {
    const loincCode = getLoincCode(v.code);
    const display = getCodeDisplay(v.code).toLowerCase();
    if (loincCode === "85354-9" || display.includes("blood pressure")) {
      const systolic = v.component?.find((c) => {
        const code = getLoincCode(c.code);
        return code === "8480-6" || getCodeDisplay(c.code).toLowerCase().includes("systolic");
      });
      const diastolic = v.component?.find((c) => {
        const code = getLoincCode(c.code);
        return code === "8462-4" || getCodeDisplay(c.code).toLowerCase().includes("diastolic");
      });
      if (systolic?.valueQuantity?.value && diastolic?.valueQuantity?.value) {
        return `${systolic.valueQuantity.value}/${diastolic.valueQuantity.value} mmHg`;
      }
    }
  }
  return null;
}

function extractNumericVital(
  vitals: Observation[],
  identifiers: string[],
): number | null {
  for (const v of vitals) {
    const loincCode = getLoincCode(v.code);
    const display = getCodeDisplay(v.code).toLowerCase();
    const match = identifiers.some(
      (id) => loincCode === id || display.includes(id.toLowerCase()),
    );
    if (match && v.valueQuantity?.value !== undefined) {
      return v.valueQuantity.value;
    }
  }
  return null;
}
