import type {
  Patient,
  HumanName,
  CodeableConcept,
  Condition,
} from "../fhir/types.js";

/**
 * Calculate a patient's age in years from their birthDate.
 */
export function getPatientAge(patient: Patient): number {
  if (!patient.birthDate) return 0;
  const birth = new Date(patient.birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Return the patient's administrative gender as a lowercase string.
 */
export function getPatientSex(patient: Patient): string {
  return (patient.gender ?? "unknown").toLowerCase();
}

/**
 * Format a FHIR HumanName into a readable string.
 */
export function formatHumanName(name: HumanName): string {
  if (name.text) return name.text;
  const parts: string[] = [];
  if (name.prefix?.length) parts.push(name.prefix.join(" "));
  if (name.given?.length) parts.push(name.given.join(" "));
  if (name.family) parts.push(name.family);
  if (name.suffix?.length) parts.push(name.suffix.join(" "));
  return parts.join(" ") || "Unknown";
}

/**
 * Get the display text from a CodeableConcept.
 */
export function getCodeDisplay(concept: CodeableConcept | undefined): string {
  if (!concept) return "Unknown";
  if (concept.text) return concept.text;
  const coding = concept.coding?.[0];
  return coding?.display ?? coding?.code ?? "Unknown";
}

/**
 * Extract the LOINC code from a CodeableConcept, if present.
 */
export function getLoincCode(concept: CodeableConcept | undefined): string | null {
  if (!concept?.coding) return null;
  const loinc = concept.coding.find(
    (c) => c.system === "http://loinc.org" && c.code,
  );
  return loinc?.code ?? null;
}

/**
 * Determine whether a Condition resource is clinically active.
 */
export function isActiveCondition(condition: Condition): boolean {
  const statusText =
    condition.clinicalStatus?.coding?.[0]?.code ??
    condition.clinicalStatus?.text ??
    "";
  return ["active", "recurrence", "relapse"].includes(statusText.toLowerCase());
}

/**
 * CKD-EPI 2021 eGFR equation (race-free).
 * Returns mL/min/1.73 m^2.
 */
export function calculateEGFR(
  creatinine: number,
  age: number,
  sex: string,
): number {
  const isFemale = sex.toLowerCase() === "female";
  const kappa = isFemale ? 0.7 : 0.9;
  const alpha = isFemale ? -0.241 : -0.302;
  const multiplier = isFemale ? 1.012 : 1.0;

  const scrOverKappa = creatinine / kappa;
  const minTerm = Math.min(scrOverKappa, 1);
  const maxTerm = Math.max(scrOverKappa, 1);

  const egfr =
    142 *
    Math.pow(minTerm, alpha) *
    Math.pow(maxTerm, -1.2) *
    Math.pow(0.9938, age) *
    multiplier;

  return Math.round(egfr * 10) / 10;
}

/**
 * Calculate the anion gap: Na - (Cl + HCO3).
 */
export function calculateAnionGap(
  sodium: number,
  chloride: number,
  bicarb: number,
): number {
  return Math.round((sodium - (chloride + bicarb)) * 10) / 10;
}

/**
 * Calculate BMI given weight in kg and height in cm.
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) return 0;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

/**
 * Return the number of days between a date string and today.
 */
export function daysAgo(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Format a date string (ISO) into a human-readable date.
 */
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "Unknown";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Check if a condition code matches a given set of keywords (case-insensitive).
 */
export function conditionMatchesKeywords(
  condition: Condition,
  keywords: string[],
): boolean {
  const display = getCodeDisplay(condition.code).toLowerCase();
  const text = (condition.code?.text ?? "").toLowerCase();
  const codes = condition.code?.coding?.map((c) => c.code ?? "").join(" ").toLowerCase() ?? "";
  const combined = `${display} ${text} ${codes}`;

  return keywords.some((kw) => combined.includes(kw.toLowerCase()));
}

/**
 * Extract SNOMED-CT code from a CodeableConcept if present.
 */
export function getSnomedCode(concept: CodeableConcept | undefined): string | null {
  if (!concept?.coding) return null;
  const snomed = concept.coding.find(
    (c) =>
      c.system === "http://snomed.info/sct" && c.code,
  );
  return snomed?.code ?? null;
}

/**
 * Format a FHIR resource as an inline citation token, e.g. `Condition/abc-123`.
 * Returns the empty string when the resource is missing a resourceType or id —
 * callers can append unconditionally without producing dangling " ``" suffixes.
 *
 * The leading single space is intentional: callers append directly to the end
 * of an emitted line, and an empty return collapses cleanly.
 */
export function formatResourceRef(
  resource: { resourceType?: string; id?: string } | null | undefined,
): string {
  if (!resource) return "";
  return formatResourceRefParts(resource.resourceType, resource.id);
}

/**
 * Format a citation from a separately-known resourceType + id pair.
 * Use this when you have a resource id but not the typed resource object.
 */
export function formatResourceRefParts(
  resourceType: string | undefined,
  id: string | undefined,
): string {
  if (!resourceType || !id) return "";
  return ` \`${resourceType}/${id}\``;
}
