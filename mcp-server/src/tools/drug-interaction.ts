import type { FHIRClient } from "../fhir/client.js";
import { getActiveMedications } from "../fhir/queries/medications.js";
import { getAllergies } from "../fhir/queries/allergies.js";
import { getCodeDisplay } from "../utils/fhir-helpers.js";
import { DRUG_INTERACTION_MATRIX } from "../config/constants.js";
import { getRxCUI, getMultiInteractions } from "../external/rxnorm.js";
import { searchDrugLabel } from "../external/openfda.js";

export interface DrugInteractionInput {
  patientId?: string;
  medications?: string[];
}

interface InteractionReport {
  drug1: string;
  drug2: string;
  severity: string;
  mechanism: string;
  clinicalEffect: string;
  recommendation: string;
  source: string;
}

interface AllergyAlert {
  medication: string;
  allergen: string;
  criticality: string;
  reactions: string;
}

interface TherapeuticDuplication {
  drugClass: string;
  medications: string[];
  recommendation: string;
}

export async function checkDrugInteractions(
  client: FHIRClient | null,
  input: DrugInteractionInput,
): Promise<string> {
  const parts: string[] = [];
  let medicationNames: string[] = input.medications ?? [];

  // ── Gather medications from FHIR if patientId is provided ──────────────
  if (input.patientId && client) {
    const fhirMeds = await getActiveMedications(client, input.patientId);
    const fhirMedNames = fhirMeds.map((m) =>
      getCodeDisplay(m.medicationCodeableConcept),
    );
    medicationNames = [...new Set([...medicationNames, ...fhirMedNames])];
  }

  if (medicationNames.length === 0) {
    return "No medications provided or found for interaction checking.";
  }

  parts.push("# Drug Interaction Check Report");
  parts.push("");
  parts.push(`**Medications Evaluated:** ${medicationNames.join(", ")}`);
  parts.push("");

  // ── 1. Check local DRUG_INTERACTION_MATRIX ─────────────────────────────
  const localInteractions = checkLocalMatrix(medicationNames);

  // ── 2. Resolve RxCUIs and check RxNorm interactions ────────────────────
  const rxnormInteractions = await checkRxNormInteractions(medicationNames);

  // ── 3. Check OpenFDA labels for additional info ────────────────────────
  const fdaInteractions = await checkOpenFDAInteractions(medicationNames);

  // ── 4. Detect therapeutic duplications ─────────────────────────────────
  const duplications = await detectTherapeuticDuplications(medicationNames);

  // ── 5. Check allergy alerts ────────────────────────────────────────────
  let allergyAlerts: AllergyAlert[] = [];
  if (input.patientId && client) {
    allergyAlerts = await checkAllergyConflicts(client, input.patientId, medicationNames);
  }

  // ── Combine and deduplicate interactions ────────────────────────────────
  const allInteractions = deduplicateInteractions([
    ...localInteractions,
    ...rxnormInteractions,
  ]);

  // ── Format output ──────────────────────────────────────────────────────

  // Allergy alerts (highest priority)
  if (allergyAlerts.length > 0) {
    parts.push("## ALLERGY ALERTS");
    for (const alert of allergyAlerts) {
      parts.push(`### ${alert.medication} <-> ${alert.allergen}`);
      parts.push(`- **Criticality:** ${alert.criticality}`);
      parts.push(`- **Known Reactions:** ${alert.reactions}`);
      parts.push(`- **Recommendation:** DO NOT ADMINISTER. Verify allergy status with patient.`);
      parts.push("");
    }
  }

  // HIGH severity interactions
  const highInteractions = allInteractions.filter((i) => i.severity === "HIGH");
  if (highInteractions.length > 0) {
    parts.push("## HIGH Severity Interactions");
    for (const ix of highInteractions) {
      parts.push(`### ${ix.drug1} + ${ix.drug2}`);
      parts.push(`- **Severity:** HIGH`);
      parts.push(`- **Mechanism:** ${ix.mechanism}`);
      parts.push(`- **Clinical Effect:** ${ix.clinicalEffect}`);
      parts.push(`- **Recommendation:** ${ix.recommendation}`);
      parts.push(`- **Source:** ${ix.source}`);
      parts.push("");
    }
  }

  // MODERATE severity interactions
  const modInteractions = allInteractions.filter((i) => i.severity === "MODERATE");
  if (modInteractions.length > 0) {
    parts.push("## MODERATE Severity Interactions");
    for (const ix of modInteractions) {
      parts.push(`### ${ix.drug1} + ${ix.drug2}`);
      parts.push(`- **Severity:** MODERATE`);
      parts.push(`- **Mechanism:** ${ix.mechanism}`);
      parts.push(`- **Clinical Effect:** ${ix.clinicalEffect}`);
      parts.push(`- **Recommendation:** ${ix.recommendation}`);
      parts.push(`- **Source:** ${ix.source}`);
      parts.push("");
    }
  }

  // RxNorm API interactions (may have different severity labeling)
  const otherInteractions = allInteractions.filter(
    (i) => i.severity !== "HIGH" && i.severity !== "MODERATE",
  );
  if (otherInteractions.length > 0) {
    parts.push("## Additional Interactions (from RxNorm API)");
    for (const ix of otherInteractions) {
      parts.push(`### ${ix.drug1} + ${ix.drug2}`);
      parts.push(`- **Severity:** ${ix.severity}`);
      parts.push(`- **Details:** ${ix.clinicalEffect}`);
      parts.push(`- **Source:** ${ix.source}`);
      parts.push("");
    }
  }

  // Therapeutic duplications
  if (duplications.length > 0) {
    parts.push("## Therapeutic Duplications");
    for (const dup of duplications) {
      parts.push(`### Drug Class: ${dup.drugClass}`);
      parts.push(`- **Medications:** ${dup.medications.join(", ")}`);
      parts.push(`- **Recommendation:** ${dup.recommendation}`);
      parts.push("");
    }
  }

  // OpenFDA label interaction notes
  if (fdaInteractions.length > 0) {
    parts.push("## FDA Label Interaction Notes");
    for (const fda of fdaInteractions) {
      parts.push(`- ${fda}`);
    }
    parts.push("");
  }

  // Summary
  const totalIssues =
    allergyAlerts.length +
    allInteractions.length +
    duplications.length;

  if (totalIssues === 0) {
    parts.push("## Summary");
    parts.push("No significant drug-drug interactions, allergy conflicts, or therapeutic duplications were identified based on available data.");
    parts.push("");
    parts.push("*Note: This does not replace clinical judgement. Some interactions may not be captured in reference databases.*");
  } else {
    parts.push("## Summary");
    parts.push(
      `Found **${allergyAlerts.length}** allergy alert(s), **${highInteractions.length}** high-severity interaction(s), **${modInteractions.length}** moderate-severity interaction(s), and **${duplications.length}** therapeutic duplication(s).`,
    );
    parts.push("");
    parts.push("*This report is for clinical decision support only and does not replace clinical judgement.*");
  }

  return parts.join("\n");
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function checkLocalMatrix(medications: string[]): InteractionReport[] {
  const results: InteractionReport[] = [];
  const lowerMeds = medications.map((m) => m.toLowerCase());

  for (const entry of DRUG_INTERACTION_MATRIX) {
    const d1 = entry.drug1.toLowerCase();
    const d2 = entry.drug2.toLowerCase();

    const d1Match = lowerMeds.some((m) => m.includes(d1) || d1.includes(m));
    const d2Match = lowerMeds.some((m) => m.includes(d2) || d2.includes(m));

    if (d1Match && d2Match) {
      results.push({
        drug1: entry.drug1,
        drug2: entry.drug2,
        severity: entry.severity,
        mechanism: entry.mechanism,
        clinicalEffect: entry.clinicalEffect,
        recommendation: entry.recommendation,
        source: "MedAssist Reference Database",
      });
    }
  }

  return results;
}

async function checkRxNormInteractions(
  medications: string[],
): Promise<InteractionReport[]> {
  // Resolve RxCUIs
  const rxcuiMap: Map<string, string> = new Map();
  const resolvePromises = medications.map(async (med) => {
    const rxcui = await getRxCUI(med);
    if (rxcui) rxcuiMap.set(med, rxcui);
  });

  await Promise.allSettled(resolvePromises);

  const rxcuis = Array.from(rxcuiMap.values());
  if (rxcuis.length < 2) return [];

  const interactions = await getMultiInteractions(rxcuis);
  return interactions.map((ix) => ({
    drug1: ix.drug1,
    drug2: ix.drug2,
    severity: ix.severity,
    mechanism: "",
    clinicalEffect: ix.description,
    recommendation: "",
    source: `RxNorm (${ix.source})`,
  }));
}

async function checkOpenFDAInteractions(
  medications: string[],
): Promise<string[]> {
  const notes: string[] = [];

  // Only check first 5 medications to avoid rate limits
  const medsToCheck = medications.slice(0, 5);

  const promises = medsToCheck.map(async (med) => {
    const label = await searchDrugLabel(med);
    if (label?.interactions?.length) {
      // Truncate long interaction text
      const interactionText = label.interactions[0];
      const truncated =
        interactionText.length > 500
          ? interactionText.substring(0, 500) + "..."
          : interactionText;
      return `**${med}:** ${truncated}`;
    }
    return null;
  });

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      notes.push(r.value);
    }
  }

  return notes;
}

async function detectTherapeuticDuplications(
  medications: string[],
): Promise<TherapeuticDuplication[]> {
  const classMap: Map<string, string[]> = new Map();

  const promises = medications.map(async (med) => {
    const label = await searchDrugLabel(med);
    if (label?.pharmClasses?.length) {
      for (const pc of label.pharmClasses) {
        return { med, pharmClass: pc };
      }
    }
    return null;
  });

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      const { med, pharmClass } = r.value;
      if (!classMap.has(pharmClass)) {
        classMap.set(pharmClass, []);
      }
      classMap.get(pharmClass)!.push(med);
    }
  }

  const duplications: TherapeuticDuplication[] = [];
  for (const [drugClass, meds] of classMap.entries()) {
    if (meds.length > 1) {
      duplications.push({
        drugClass,
        medications: meds,
        recommendation: `Multiple medications from the same drug class (${drugClass}). Review for therapeutic duplication. Consider whether all agents are necessary.`,
      });
    }
  }

  return duplications;
}

async function checkAllergyConflicts(
  client: FHIRClient,
  patientId: string,
  medications: string[],
): Promise<AllergyAlert[]> {
  const allergies = await getAllergies(client, patientId);
  const alerts: AllergyAlert[] = [];

  for (const allergy of allergies) {
    const allergenDisplay = getCodeDisplay(allergy.code).toLowerCase();

    for (const med of medications) {
      if (
        allergenDisplay.includes(med.toLowerCase()) ||
        med.toLowerCase().includes(allergenDisplay)
      ) {
        const reactions = allergy.reaction
          ?.flatMap(
            (r) =>
              r.manifestation?.map((m) => getCodeDisplay(m)) ?? [],
          )
          .join(", ") || "Not specified";

        alerts.push({
          medication: med,
          allergen: getCodeDisplay(allergy.code),
          criticality: allergy.criticality ?? "unknown",
          reactions,
        });
      }
    }
  }

  return alerts;
}

function deduplicateInteractions(
  interactions: InteractionReport[],
): InteractionReport[] {
  const seen = new Set<string>();
  const unique: InteractionReport[] = [];

  for (const ix of interactions) {
    const key1 = `${ix.drug1.toLowerCase()}|${ix.drug2.toLowerCase()}`;
    const key2 = `${ix.drug2.toLowerCase()}|${ix.drug1.toLowerCase()}`;

    if (!seen.has(key1) && !seen.has(key2)) {
      seen.add(key1);
      unique.push(ix);
    }
  }

  // Sort by severity: HIGH first, then MODERATE, then others
  const severityOrder: Record<string, number> = { HIGH: 0, MODERATE: 1 };
  unique.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2),
  );

  return unique;
}
