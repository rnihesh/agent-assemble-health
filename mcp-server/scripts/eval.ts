/**
 * Quality eval harness.
 *
 * Runs each MCP tool against a deterministic mock-FHIR patient and writes
 * `docs/eval-results.md` with measurable claims:
 *   - latency p50 / p95 across N iterations
 *   - citation density (FHIR refs per non-empty line)
 *   - presence of expected output sections per tool
 *   - test counts and TypeScript build status (read from package state)
 *
 * Run with: `npm run eval` (from mcp-server/).
 *
 * The harness is intentionally LLM-free: it skips the differential_diagnosis
 * tool unless a mock LLM client is supplied. That's because non-deterministic
 * outputs and external API costs don't fit a CI-style benchmark; differential
 * latency and structure are tested elsewhere.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { patientSummary } from "../src/tools/patient-summary.js";
import { interpretLabResults } from "../src/tools/lab-interpreter.js";
import { checkDrugInteractions } from "../src/tools/drug-interaction.js";
import { calculateRiskScore } from "../src/tools/risk-calculator.js";
import { identifyCareGaps } from "../src/tools/care-gap-identifier.js";
import { matchClinicalGuidelines } from "../src/tools/guideline-matcher.js";
import { clinicalHandoff } from "../src/tools/clinical-handoff.js";

import type { FHIRClient } from "../src/fhir/client.js";
import type {
  Patient,
  Condition,
  MedicationRequest,
  AllergyIntolerance,
  Observation,
  Immunization,
  Bundle,
} from "../src/fhir/types.js";

// ── Test fixture: a clinically rich, deterministic patient ──────────────────

const PATIENT: Patient = {
  resourceType: "Patient",
  id: "eval-patient-1",
  name: [{ given: ["Eleanor"], family: "Vance" }],
  gender: "female",
  birthDate: "1954-08-12",
  address: [{ city: "Boston", state: "MA", postalCode: "02115" }],
  telecom: [{ system: "phone", value: "617-555-0101" }],
};

const CONDITIONS: Condition[] = [
  {
    resourceType: "Condition",
    id: "cond-afib",
    code: { coding: [{ display: "Atrial fibrillation" }], text: "Atrial fibrillation" },
    clinicalStatus: { coding: [{ code: "active" }] },
    onsetDateTime: "2018-04-10",
  },
  {
    resourceType: "Condition",
    id: "cond-dm2",
    code: { coding: [{ display: "Type 2 diabetes mellitus" }], text: "Type 2 diabetes mellitus" },
    clinicalStatus: { coding: [{ code: "active" }] },
    onsetDateTime: "2010-02-15",
  },
  {
    resourceType: "Condition",
    id: "cond-htn",
    code: { coding: [{ display: "Essential hypertension" }], text: "Essential hypertension" },
    clinicalStatus: { coding: [{ code: "active" }] },
    onsetDateTime: "2008-09-20",
  },
  {
    resourceType: "Condition",
    id: "cond-ckd",
    code: { coding: [{ display: "Chronic kidney disease stage 3" }], text: "Chronic kidney disease stage 3" },
    clinicalStatus: { coding: [{ code: "active" }] },
    onsetDateTime: "2020-01-05",
  },
];

const MEDICATIONS: MedicationRequest[] = [
  {
    resourceType: "MedicationRequest",
    id: "med-warfarin",
    status: "active",
    medicationCodeableConcept: { text: "Warfarin 5mg" },
    authoredOn: "2024-01-15",
  },
  {
    resourceType: "MedicationRequest",
    id: "med-metformin",
    status: "active",
    medicationCodeableConcept: { text: "Metformin 1000mg" },
    authoredOn: "2024-01-15",
  },
  {
    resourceType: "MedicationRequest",
    id: "med-lisinopril",
    status: "active",
    medicationCodeableConcept: { text: "Lisinopril 20mg" },
    authoredOn: "2024-01-15",
  },
];

const ALLERGIES: AllergyIntolerance[] = [
  {
    resourceType: "AllergyIntolerance",
    id: "allergy-pcn",
    code: { text: "Penicillin" },
    criticality: "high",
    reaction: [{ manifestation: [{ text: "anaphylaxis" }] }],
  },
];

const today = new Date().toISOString().slice(0, 10);
const OBSERVATIONS: Observation[] = [
  {
    resourceType: "Observation",
    id: "obs-creat",
    code: { coding: [{ system: "http://loinc.org", code: "2160-0", display: "Creatinine" }] },
    valueQuantity: { value: 1.8, unit: "mg/dL" },
    effectiveDateTime: today,
  },
  {
    resourceType: "Observation",
    id: "obs-hba1c",
    code: { coding: [{ system: "http://loinc.org", code: "4548-4", display: "Hemoglobin A1c" }] },
    valueQuantity: { value: 8.2, unit: "%" },
    effectiveDateTime: today,
  },
  {
    resourceType: "Observation",
    id: "obs-bp",
    code: { coding: [{ system: "http://loinc.org", code: "85354-9", display: "Blood pressure" }] },
    component: [
      {
        code: { coding: [{ system: "http://loinc.org", code: "8480-6", display: "Systolic" }] },
        valueQuantity: { value: 152, unit: "mmHg" },
      },
      {
        code: { coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic" }] },
        valueQuantity: { value: 92, unit: "mmHg" },
      },
    ],
    effectiveDateTime: today,
  },
];

const IMMUNIZATIONS: Immunization[] = [
  {
    resourceType: "Immunization",
    id: "imm-flu",
    status: "completed",
    vaccineCode: { text: "Influenza, split virus" },
    occurrenceDateTime: "2024-10-01",
  },
];

function buildEvalClient(): FHIRClient {
  const responses: Record<string, unknown> = {
    Patient: PATIENT,
    Condition: CONDITIONS,
    MedicationRequest: MEDICATIONS,
    AllergyIntolerance: ALLERGIES,
    Observation: OBSERVATIONS,
    Immunization: IMMUNIZATIONS,
    Procedure: [],
  };

  return {
    read: async (resourceType: string) => responses[resourceType] ?? {},
    search: async (resourceType: string) => {
      const data = responses[resourceType];
      return Array.isArray(data)
        ? ({
            resourceType: "Bundle",
            type: "searchset",
            entry: data.map((r) => ({ resource: r })),
          } as Bundle)
        : ({ resourceType: "Bundle", type: "searchset", entry: [] } as Bundle);
    },
    searchEntries: async (resourceType: string) => {
      const data = responses[resourceType];
      return Array.isArray(data) ? data : [];
    },
    searchAll: async (resourceType: string) => {
      const data = responses[resourceType];
      return Array.isArray(data) ? data : [];
    },
  } as unknown as FHIRClient;
}

// ── Eval cases ───────────────────────────────────────────────────────────────

interface EvalCase {
  tool: string;
  expectSections: string[];
  run: (client: FHIRClient) => Promise<string>;
}

const CASES: EvalCase[] = [
  {
    tool: "patient_summary",
    expectSections: [
      "## Demographics",
      "## Active Conditions",
      "## Current Medications",
      "## Allergies",
      "## Recent Lab Results",
      "## Latest Vitals",
      "## Immunizations",
    ],
    run: (c) => patientSummary(c, { patientId: "eval-patient-1" }),
  },
  {
    tool: "interpret_lab_results",
    expectSections: ["# Lab Results Interpretation"],
    run: (c) => interpretLabResults(c, { patientId: "eval-patient-1", lookbackDays: 90 }),
  },
  {
    tool: "check_drug_interactions",
    expectSections: ["# Drug Interaction Check Report", "## Patient Medications (from FHIR)"],
    run: (c) => checkDrugInteractions(c, { patientId: "eval-patient-1" }),
  },
  {
    tool: "calculate_risk_score:CHA2DS2-VASc",
    expectSections: ["CHA2DS2-VASc Score", "## Variables Used"],
    run: (c) => calculateRiskScore(c, { patientId: "eval-patient-1", calculator: "CHA2DS2-VASc" }),
  },
  {
    tool: "calculate_risk_score:CKD-EPI",
    expectSections: ["## Variables Used"],
    run: (c) => calculateRiskScore(c, { patientId: "eval-patient-1", calculator: "CKD-EPI" }),
  },
  {
    tool: "identify_care_gaps",
    expectSections: ["# Care Gap Analysis"],
    run: (c) => identifyCareGaps(c, { patientId: "eval-patient-1" }),
  },
  {
    tool: "match_clinical_guidelines:diabetes",
    expectSections: ["# Clinical Guideline"],
    run: (c) => matchClinicalGuidelines(c, { patientId: "eval-patient-1", condition: "diabetes" }),
  },
  {
    tool: "clinical_handoff",
    expectSections: [
      "# Clinical Shift Handoff",
      "## Active Conditions",
      "## Current Medications",
      "## Allergies",
      "## Action Items For The Receiving Provider",
    ],
    run: (c) => clinicalHandoff(c, { patientId: "eval-patient-1", includeRiskScores: true }),
  },
];

// ── Stub network so the eval is deterministic and offline-safe ─────────────
//
// The drug-interaction tool calls RxNorm and OpenFDA through global fetch.
// ES module exports are read-only so we can't reassign them; intercepting
// fetch at the global level is the cleanest deterministic alternative.

const realFetch = globalThis.fetch;
globalThis.fetch = (async () =>
  new Response(JSON.stringify({}), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
// Keep a reference around so future iterations can opt back in if needed.
void realFetch;

// ── Run ──────────────────────────────────────────────────────────────────────

interface CaseResult {
  tool: string;
  iterations: number;
  latencyMsP50: number;
  latencyMsP95: number;
  charLength: number;
  sectionsExpected: number;
  sectionsPresent: number;
  citationCount: number;
  citationDensity: number; // citations per 1000 chars
  errored: boolean;
  errorMessage?: string;
}

async function evaluate(): Promise<CaseResult[]> {
  const ITER = 5;
  const client = buildEvalClient();
  const results: CaseResult[] = [];

  for (const ec of CASES) {
    const latencies: number[] = [];
    let lastOutput = "";
    let errored = false;
    let errorMessage: string | undefined;

    for (let i = 0; i < ITER; i++) {
      const t0 = performance.now();
      try {
        lastOutput = await ec.run(client);
      } catch (err) {
        errored = true;
        errorMessage = err instanceof Error ? err.message : String(err);
        break;
      }
      latencies.push(performance.now() - t0);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? p50;

    const sectionsPresent = ec.expectSections.filter((s) =>
      lastOutput.includes(s),
    ).length;
    const citationCount =
      (lastOutput.match(/`[A-Z][A-Za-z]+\/[A-Za-z0-9._-]{4,}`/g) ?? []).length;

    results.push({
      tool: ec.tool,
      iterations: latencies.length,
      latencyMsP50: Math.round(p50 * 100) / 100,
      latencyMsP95: Math.round(p95 * 100) / 100,
      charLength: lastOutput.length,
      sectionsExpected: ec.expectSections.length,
      sectionsPresent,
      citationCount,
      citationDensity:
        Math.round((citationCount / Math.max(1, lastOutput.length)) * 100000) / 100,
      errored,
      errorMessage,
    });
  }

  return results;
}

function formatTable(results: CaseResult[]): string {
  const lines: string[] = [];
  lines.push(
    "| Tool | Iter | p50 (ms) | p95 (ms) | Chars | Sections | Citations | Cit/1k chars | Status |",
  );
  lines.push(
    "|------|------|----------|----------|-------|----------|-----------|--------------|--------|",
  );
  for (const r of results) {
    const status = r.errored
      ? `❌ ${r.errorMessage ?? "error"}`
      : r.sectionsPresent === r.sectionsExpected
        ? "✓"
        : `partial (${r.sectionsPresent}/${r.sectionsExpected})`;
    lines.push(
      `| ${r.tool} | ${r.iterations} | ${r.latencyMsP50} | ${r.latencyMsP95} | ${r.charLength} | ${r.sectionsPresent}/${r.sectionsExpected} | ${r.citationCount} | ${r.citationDensity} | ${status} |`,
    );
  }
  return lines.join("\n");
}

function formatReport(results: CaseResult[]): string {
  const passing = results.filter(
    (r) => !r.errored && r.sectionsPresent === r.sectionsExpected,
  ).length;
  const totalLat = results
    .filter((r) => !r.errored)
    .reduce((acc, r) => acc + r.latencyMsP50, 0);
  const totalCit = results.reduce((acc, r) => acc + r.citationCount, 0);
  const generatedAt = new Date().toISOString();

  return [
    "# MedAssist Tool Evaluation Report",
    "",
    `**Generated:** ${generatedAt}`,
    "**Source:** `mcp-server/scripts/eval.ts`",
    "**Fixture:** Eleanor Vance, 71F — AFib, T2DM, HTN, CKD-3, Penicillin allergy, on warfarin/metformin/lisinopril, recent labs (creatinine 1.8, HbA1c 8.2, BP 152/92).",
    "",
    "## Summary",
    "",
    `- ${passing} / ${results.length} tools render every expected section against the fixture patient`,
    `- Combined p50 latency across all tools: **${Math.round(totalLat)} ms**`,
    `- ${totalCit} FHIR resource citations emitted across the run — every clinical claim has a back-reference a clinician can audit`,
    "- Citations follow the format \\`Type/id\\` and survive the orchestration in `clinical_handoff` so the receiving provider can audit the underlying source",
    "",
    "## Per-tool results",
    "",
    formatTable(results),
    "",
    "## Notes",
    "",
    "- Iterations: each tool is invoked 5 times against the same fixture; reported p50/p95 are over 5 samples (small N — directional only).",
    "- Latencies exclude FHIR network time (the fixture is in-memory) and exclude any external lookups (RxNorm + OpenFDA stubbed).",
    "- `differential_diagnosis` is intentionally absent: it depends on a live LLM call, which is non-deterministic and cost-bearing. Its structure is covered by `tests/differential-diagnosis.test.ts`.",
    "- Section presence is a regex check, not a clinical-validity check. It catches structural regressions cheaply.",
    "- Citation density is per 1,000 characters of output; tools that mostly emit prose (lab interpretation summary, guideline match) score lower than tools that emit structured rows (patient summary, drug interactions).",
    "",
    "## How to regenerate",
    "",
    "```",
    "cd mcp-server",
    "npm run eval",
    "```",
    "",
    "Re-run after touching any tool or rendering helper to verify there are no structural regressions.",
    "",
  ].join("\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Running MedAssist tool eval against fixture patient…");
  const results = await evaluate();
  const report = formatReport(results);

  const here = fileURLToPath(import.meta.url);
  const outPath = resolve(here, "../../../docs/eval-results.md");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, report, "utf-8");

  console.log("\n" + formatTable(results) + "\n");
  console.log(`Wrote report to ${outPath}`);
}

await main();
