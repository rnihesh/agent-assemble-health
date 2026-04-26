import type { FHIRClient } from "../fhir/client.js";
import { patientSummary } from "./patient-summary.js";
import { interpretLabResults } from "./lab-interpreter.js";
import { checkDrugInteractions } from "./drug-interaction.js";
import { identifyCareGaps } from "./care-gap-identifier.js";
import { calculateRiskScore } from "./risk-calculator.js";
import { getPatient } from "../fhir/queries/patient.js";
import { getConditions } from "../fhir/queries/conditions.js";
import {
  formatHumanName,
  getPatientAge,
  getPatientSex,
  conditionMatchesKeywords,
} from "../utils/fhir-helpers.js";

export interface ClinicalHandoffInput {
  patientId: string;
  /** Lookback window for labs in days. Defaults to 90. */
  lookbackDays?: number;
  /** When false, skip the risk-score block. Defaults true. */
  includeRiskScores?: boolean;
}

/**
 * Generate a structured shift-handoff document for a patient. Composes
 * patient_summary, interpret_lab_results, check_drug_interactions, and
 * identify_care_gaps into one read; optionally adds risk scores selected
 * automatically based on the patient's condition profile.
 *
 * Designed for the receiving-provider workflow at end of shift: lead with
 * "what changed and what needs attention," not just "everything we know."
 */
export async function clinicalHandoff(
  client: FHIRClient,
  input: ClinicalHandoffInput,
): Promise<string> {
  const lookbackDays = input.lookbackDays ?? 90;
  const includeRisk = input.includeRiskScores ?? true;

  // Resolve identity once for the header.
  const patient = await getPatient(client, input.patientId);
  const name = patient.name?.length
    ? formatHumanName(patient.name[0])
    : "Unknown";
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);

  // Run the four primary tools sequentially. The public HAPI sandbox
  // rate-limits aggressive parallel bursts (24+ FHIR GETs at once), and
  // shift-handoff use is latency-tolerant. Going serial trades ~6s of
  // wall time for reliability on demo day.
  const summary = await patientSummary(client, {
    patientId: input.patientId,
    sections: ["conditions", "medications", "allergies", "vitals"],
  });
  const labs = await interpretLabResults(client, {
    patientId: input.patientId,
    lookbackDays,
  });
  const interactions = await checkDrugInteractions(client, {
    patientId: input.patientId,
  });
  const gaps = await identifyCareGaps(client, { patientId: input.patientId });

  // Pick risk calculators based on conditions.
  let riskBlock = "";
  if (includeRisk) {
    riskBlock = await buildRiskBlock(client, input.patientId);
  }

  const lines: string[] = [];
  lines.push(`# Clinical Shift Handoff`);
  lines.push("");
  lines.push(
    `**Patient:** ${name} | Age: ${age} | Sex: ${capitalize(sex)} | ID: \`Patient/${input.patientId}\``,
  );
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push(extractSection(summary, "## Active Conditions") || "## Active Conditions\n\nNo active conditions on record.");
  lines.push("");
  lines.push(extractSection(summary, "## Current Medications") || "## Current Medications\n\nNo active medications on record.");
  lines.push("");
  lines.push(extractSection(summary, "## Allergies") || "## Allergies\n\nNo known allergies on record.");
  lines.push("");

  // Vital signs are the things a receiving provider scans first.
  const vitals = extractSection(summary, "## Latest Vitals");
  if (vitals) {
    lines.push(vitals.replace("## Latest Vitals", "## Vitals"));
    lines.push("");
  }

  // Lab interpretation: lead with criticals + abnormals; suppress the
  // "Normal Results" tail because handoff should focus on what needs
  // attention.
  const labCritical = extractSection(labs, "## CRITICAL VALUES");
  const labAbnormal = extractSection(labs, "## Abnormal Results");
  const labTrends = extractSection(labs, "## Trends");
  if (labCritical || labAbnormal || labTrends) {
    lines.push("## Labs To Watch");
    lines.push("");
    if (labCritical) {
      lines.push(stripHeading(labCritical));
      lines.push("");
    }
    if (labAbnormal) {
      lines.push(stripHeading(labAbnormal));
      lines.push("");
    }
    if (labTrends) {
      lines.push(stripHeading(labTrends));
      lines.push("");
    }
  } else {
    lines.push("## Labs To Watch");
    lines.push("");
    lines.push(`No abnormal labs in the last ${lookbackDays} days.`);
    lines.push("");
  }

  // Interaction concerns: surface ALERTS, HIGH, MODERATE only.
  const allergies = extractSection(interactions, "## ALLERGY ALERTS");
  const high = extractSection(interactions, "## HIGH Severity Interactions");
  const moderate = extractSection(
    interactions,
    "## MODERATE Severity Interactions",
  );
  if (allergies || high || moderate) {
    lines.push("## Medication Concerns");
    lines.push("");
    if (allergies) {
      lines.push(stripHeading(allergies));
      lines.push("");
    }
    if (high) {
      lines.push(stripHeading(high));
      lines.push("");
    }
    if (moderate) {
      lines.push(stripHeading(moderate));
      lines.push("");
    }
  }

  // Care gaps: forward the top 5 highest-priority items.
  const gapBody = trimToTopGaps(gaps, 5);
  if (gapBody) {
    lines.push("## Open Care Gaps (top 5)");
    lines.push("");
    lines.push(gapBody);
    lines.push("");
  }

  if (riskBlock) {
    lines.push(riskBlock);
    lines.push("");
  }

  lines.push("## Action Items For The Receiving Provider");
  lines.push("");
  lines.push(
    buildActionItems({
      hasCriticalLab: Boolean(labCritical),
      hasAbnormalLab: Boolean(labAbnormal),
      hasAllergyAlert: Boolean(allergies),
      hasHighInteraction: Boolean(high),
      hasModerateInteraction: Boolean(moderate),
      hasGaps: Boolean(gapBody),
    }),
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "*This handoff aggregates patient_summary, interpret_lab_results, check_drug_interactions, identify_care_gaps, and selected risk scores. It is decision support; correlate with chart review and direct examination.*",
  );

  return lines.join("\n");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function extractSection(markdown: string, heading: string): string {
  const idx = markdown.indexOf(heading);
  if (idx === -1) return "";
  // Find the next heading at the same level (## ) or end of string.
  const after = markdown.slice(idx + heading.length);
  const nextIdx = after.search(/\n## /);
  const body = nextIdx === -1 ? after : after.slice(0, nextIdx);
  return heading + body;
}

function stripHeading(section: string): string {
  // Remove the leading "## ..." line so the parent heading takes precedence.
  const newline = section.indexOf("\n");
  if (newline === -1) return "";
  return section.slice(newline + 1).trim();
}

function trimToTopGaps(gapsMd: string, max: number): string {
  // gapsMd looks like the care-gap output; pick the first `max` "### " entries
  // across all categories, preserving each entry's bullets.
  const lines = gapsMd.split("\n");
  const out: string[] = [];
  let inEntry = false;
  let kept = 0;
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (kept >= max) break;
      kept++;
      inEntry = true;
      out.push(line);
      continue;
    }
    if (inEntry) {
      // Stop the current entry at the next category heading.
      if (line.startsWith("## ")) {
        inEntry = false;
        continue;
      }
      out.push(line);
    }
  }
  // Trim trailing blank lines.
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n");
}

async function buildRiskBlock(
  client: FHIRClient,
  patientId: string,
): Promise<string> {
  // Decide which calculators apply based on conditions.
  const conditions = await getConditions(client, patientId);
  const wants: ("CHA2DS2-VASc" | "ASCVD" | "CKD-EPI")[] = [];

  const hasAfib = conditions.some((c) =>
    conditionMatchesKeywords(c, ["atrial fibrillation", "afib"]),
  );
  if (hasAfib) wants.push("CHA2DS2-VASc");

  const hasCardiacRisk = conditions.some((c) =>
    conditionMatchesKeywords(c, [
      "hypertension",
      "diabetes",
      "hyperlipidemia",
      "metabolic syndrome",
    ]),
  );
  if (hasCardiacRisk) wants.push("ASCVD");

  const hasRenal = conditions.some((c) =>
    conditionMatchesKeywords(c, [
      "kidney",
      "renal",
      "ckd",
      "nephropathy",
      "transplant",
    ]),
  );
  if (hasRenal) wants.push("CKD-EPI");

  if (wants.length === 0) return "";

  const reports = await Promise.all(
    wants.map((calc) =>
      calculateRiskScore(client, { patientId, calculator: calc }).catch(
        (err) => `*${calc}: unavailable — ${err instanceof Error ? err.message : String(err)}*`,
      ),
    ),
  );

  const blocks: string[] = ["## Applicable Risk Scores", ""];
  reports.forEach((r) => {
    blocks.push(stripHeading(r) || r);
    blocks.push("");
  });
  return blocks.join("\n");
}

function buildActionItems(flags: {
  hasCriticalLab: boolean;
  hasAbnormalLab: boolean;
  hasAllergyAlert: boolean;
  hasHighInteraction: boolean;
  hasModerateInteraction: boolean;
  hasGaps: boolean;
}): string {
  const items: string[] = [];

  if (flags.hasCriticalLab) {
    items.push(
      "1. **CRITICAL** lab values present — review immediately and confirm with repeat sample if not already done.",
    );
  }
  if (flags.hasAllergyAlert) {
    items.push(
      `${items.length + 1}. Verify allergy alerts before any new prescribing; medications listed conflict with documented allergies.`,
    );
  }
  if (flags.hasHighInteraction) {
    items.push(
      `${items.length + 1}. Address HIGH-severity drug interactions — consider alternative agents or dose adjustment with monitoring.`,
    );
  }
  if (flags.hasAbnormalLab) {
    items.push(
      `${items.length + 1}. Trend the abnormal labs against prior values; decide which need re-checking before next handoff.`,
    );
  }
  if (flags.hasModerateInteraction) {
    items.push(
      `${items.length + 1}. Review moderate drug interactions for clinical relevance to this patient's presentation.`,
    );
  }
  if (flags.hasGaps) {
    items.push(
      `${items.length + 1}. Address the highest-priority overdue screening / vaccination items if the patient remains in care this shift.`,
    );
  }
  if (items.length === 0) {
    items.push(
      "1. No urgent items flagged. Standard chart review and direct examination remain part of accepting handoff.",
    );
  }

  return items.join("\n");
}
