import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FHIRClient } from "./fhir/client.js";
import { ENV } from "./config/env.js";
import { resolveSharpContext } from "./auth/sharp-context.js";
import { assertSyntheticFhirUrl } from "./auth/phi-guard.js";
import { getCurrentRequestHeaders } from "./auth/request-headers.js";
import { patientSummary } from "./tools/patient-summary.js";
import { checkDrugInteractions } from "./tools/drug-interaction.js";
import { interpretLabResults } from "./tools/lab-interpreter.js";
import { calculateRiskScore } from "./tools/risk-calculator.js";
import { identifyCareGaps } from "./tools/care-gap-identifier.js";
import { matchClinicalGuidelines } from "./tools/guideline-matcher.js";
import { differentialDiagnosis } from "./tools/differential-diagnosis.js";
import { clinicalHandoff } from "./tools/clinical-handoff.js";
import { draftSoapNote } from "./tools/soap-note.js";

/**
 * MCP capability declaration for the Prompt Opinion FHIR-context extension.
 * See https://docs.promptopinion.ai/fhir-context/mcp-fhir-context for the
 * canonical scope list and the `fhir_context_required` flag semantics.
 *
 * `fhir_context_required.value` is `false` so the in-app dashboard (which
 * does not pass canonical SHARP headers but still exercises the tools via
 * `_meta`) keeps working. Tool implementations still emit a clear error
 * when no patient id can be resolved from any source.
 */
export const FHIR_CONTEXT_EXTENSION_URI = "ai.promptopinion/fhir-context";

export const FHIR_CONTEXT_EXTENSION = {
  scopes: [
    { name: "patient/Patient.rs", required: true },
    { name: "patient/Observation.rs" },
    { name: "patient/Condition.rs" },
    { name: "patient/MedicationStatement.rs" },
    { name: "patient/AllergyIntolerance.rs" },
    { name: "patient/Immunization.rs" },
    { name: "offline_access" },
  ],
  fhir_context_required: { value: false },
} as const;

/**
 * Build a FHIRClient from the resolved SHARP context (canonical HTTP headers
 * first, _meta fallback) or fall back to environment defaults.
 */
function buildClient(meta: unknown): FHIRClient {
  const sharp = resolveSharpContext(getCurrentRequestHeaders(), meta);
  const baseUrl = sharp?.fhirServerUrl ?? ENV.FHIR_BASE_URL;
  const token = sharp?.fhirAccessToken ?? ENV.FHIR_ACCESS_TOKEN;
  // PHI guardrail — applies whether the URL came from SHARP context or env.
  assertSyntheticFhirUrl(baseUrl);
  return new FHIRClient(baseUrl, token);
}

/**
 * Resolve the patientId from either the explicit input, canonical SHARP HTTP
 * headers (the primary spec transport), or the legacy `_meta` field used by
 * the in-app dashboard.
 */
export function resolvePatientId(
  inputPatientId: string | undefined,
  meta: unknown,
): string | undefined {
  if (inputPatientId) return inputPatientId;
  const sharp = resolveSharpContext(getCurrentRequestHeaders(), meta);
  return sharp?.patientId;
}

export function createMcpServer(): McpServer {
  // Capabilities are passed via the SDK's `capabilities` ServerOptions field.
  // The MCP spec describes vendor extensions under `capabilities.extensions[uri]`;
  // see https://docs.promptopinion.ai/fhir-context/mcp-fhir-context. We mirror
  // the shape used by po-community-mcp/typescript/index.ts verbatim.
  //
  // The installed @modelcontextprotocol/sdk types validate ServerCapabilities
  // with a Zod `$strip` schema that does not enumerate `extensions`, but the
  // transport serializes whatever shape we pass through — same pattern as the
  // upstream reference. We cast to `any` to surface the extension declaration
  // through the SDK without rewriting the schema.
  const capabilities = {
    extensions: {
      [FHIR_CONTEXT_EXTENSION_URI]: FHIR_CONTEXT_EXTENSION,
    },
  } as unknown as Record<string, unknown>;

  const server = new McpServer(
    {
      name: "medassist",
      version: "1.0.0",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { capabilities: capabilities as any },
  );

  // ── patient_summary ──────────────────────────────────────────────────────
  server.tool(
    "patient_summary",
    "Generates a comprehensive clinical summary for a patient, including demographics, active conditions, medications, allergies, recent lab results, vitals, and immunizations. Data is fetched from a FHIR R4 server.",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "The FHIR Patient resource ID. Optional when provided via SHARP launch context in _meta.",
        ),
      sections: z
        .array(
          z.enum([
            "demographics",
            "conditions",
            "medications",
            "allergies",
            "labs",
            "vitals",
            "immunizations",
          ]),
        )
        .optional()
        .describe(
          "Optional list of sections to include. Defaults to all sections if omitted.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        if (!pid) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a patientId or include SHARP patient context in _meta.",
              },
            ],
            isError: true,
          };
        }

        const client = buildClient(extra?._meta);
        const text = await patientSummary(client, {
          patientId: pid,
          sections: params.sections,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating patient summary: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── check_drug_interactions ──────────────────────────────────────────────
  server.tool(
    "check_drug_interactions",
    "Checks for drug-drug interactions, allergy conflicts, and therapeutic duplications. Uses RxNorm, OpenFDA, and a built-in interaction database. Can accept an explicit medication list, retrieve medications from a patient's FHIR record, or both.",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "FHIR Patient ID to retrieve current medications and allergies. Optional if medications are provided.",
        ),
      medications: z
        .array(z.string())
        .optional()
        .describe(
          "List of medication names to check for interactions. Optional if patientId is provided.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        const client = pid ? buildClient(extra?._meta) : null;

        if (!pid && (!params.medications || params.medications.length === 0)) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide at least a patientId or a list of medications to check for interactions.",
              },
            ],
            isError: true,
          };
        }

        const text = await checkDrugInteractions(client, {
          patientId: pid,
          medications: params.medications,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error checking drug interactions: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── interpret_lab_results ────────────────────────────────────────────────
  server.tool(
    "interpret_lab_results",
    "Interprets recent laboratory results for a patient. Flags abnormal and critical values using age/sex-adjusted reference ranges, identifies trends over time, and computes derived values (eGFR, anion gap, calculated LDL).",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "The FHIR Patient resource ID. Optional when provided via SHARP launch context in _meta.",
        ),
      lookbackDays: z
        .number()
        .optional()
        .default(90)
        .describe(
          "Number of days to look back for lab results. Defaults to 90.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        if (!pid) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a patientId or include SHARP patient context in _meta.",
              },
            ],
            isError: true,
          };
        }

        const client = buildClient(extra?._meta);
        const text = await interpretLabResults(client, {
          patientId: pid,
          lookbackDays: params.lookbackDays,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error interpreting lab results: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── calculate_risk_score ─────────────────────────────────────────────────
  server.tool(
    "calculate_risk_score",
    "Calculates a validated clinical risk score for a patient. Supports CHA2DS2-VASc (stroke risk in AFib), HEART (chest pain evaluation), Wells DVT, Wells PE, ASCVD 10-year risk, and CKD-EPI eGFR. Pulls relevant data from the patient's FHIR record.",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "The FHIR Patient resource ID. Optional when provided via SHARP launch context in _meta.",
        ),
      calculator: z
        .enum([
          "CHA2DS2-VASc",
          "HEART",
          "Wells-DVT",
          "Wells-PE",
          "ASCVD",
          "CKD-EPI",
        ])
        .describe("The risk calculator to use."),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        if (!pid) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a patientId or include SHARP patient context in _meta.",
              },
            ],
            isError: true,
          };
        }

        const client = buildClient(extra?._meta);
        const text = await calculateRiskScore(client, {
          patientId: pid,
          calculator: params.calculator,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error calculating risk score: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── identify_care_gaps ───────────────────────────────────────────────────
  server.tool(
    "identify_care_gaps",
    "Analyzes a patient's record to identify care gaps including overdue screenings (USPSTF guidelines), missing vaccinations (CDC schedule), and condition-specific monitoring gaps based on clinical guidelines (ADA, ACC/AHA, KDIGO, etc.).",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "The FHIR Patient resource ID. Optional when provided via SHARP launch context in _meta.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        if (!pid) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a patientId or include SHARP patient context in _meta.",
              },
            ],
            isError: true,
          };
        }

        const client = buildClient(extra?._meta);
        const text = await identifyCareGaps(client, {
          patientId: pid,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error identifying care gaps: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── match_clinical_guidelines ────────────────────────────────────────────
  server.tool(
    "match_clinical_guidelines",
    "Matches a patient's conditions against evidence-based clinical guidelines (ADA, ACC/AHA, GOLD, GINA, KDIGO, etc.). Compares current lab values and medications against guideline targets, identifies gaps, and generates action items.",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "FHIR Patient ID. If provided, matches the patient's conditions to guidelines.",
        ),
      condition: z
        .string()
        .optional()
        .describe(
          "Condition name to search guidelines for (e.g., 'diabetes', 'hypertension'). At least one of patientId or condition is required.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        const client = pid ? buildClient(extra?._meta) : null;

        if (!pid && !params.condition) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide at least a patientId or a condition name to match against clinical guidelines.",
              },
            ],
            isError: true,
          };
        }

        const text = await matchClinicalGuidelines(client, {
          patientId: pid,
          condition: params.condition,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error matching guidelines: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── differential_diagnosis ───────────────────────────────────────────────
  server.tool(
    "differential_diagnosis",
    "LLM-powered ranked differential diagnosis. Takes a chief complaint and reasons over the patient's longitudinal FHIR record (conditions, medications, labs, allergies, immunizations) to surface 3–5 ranked candidates with explicit supporting and contradicting findings, plus recommended next steps. Uses an OpenAI-compatible LLM (NOWBIND/Azure preferred, OpenAI fallback) configured via the MCP server's environment. This is decision support, not a diagnosis — every candidate is a hypothesis for a clinician to evaluate.",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "FHIR Patient ID. Optional when provided via SHARP launch context in _meta.",
        ),
      chiefComplaint: z
        .string()
        .describe(
          "The presenting concern in clinical shorthand, e.g. \"72yo F, progressive fatigue and bilateral lower-extremity edema over 6 weeks\".",
        ),
      additionalContext: z
        .string()
        .optional()
        .describe(
          "Optional clinician-supplied context to refine the differential, e.g. recent travel, exposures, family history.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        if (!pid) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a patientId or include SHARP patient context in _meta.",
              },
            ],
            isError: true,
          };
        }

        const client = buildClient(extra?._meta);
        const text = await differentialDiagnosis(client, {
          patientId: pid,
          chiefComplaint: params.chiefComplaint,
          additionalContext: params.additionalContext,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating differential diagnosis: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── clinical_handoff ─────────────────────────────────────────────────────
  server.tool(
    "clinical_handoff",
    "Composes a structured shift-handoff document for a patient. Aggregates active conditions, current medications, allergies, latest vitals, abnormal/critical labs from the lookback window, drug-interaction concerns, the top open care gaps, and applicable risk scores (auto-selected based on the patient's condition profile). Returns a Markdown document leading with what needs attention, ending with a numbered action list for the receiving provider.",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "FHIR Patient ID. Optional when provided via SHARP launch context in _meta.",
        ),
      lookbackDays: z
        .number()
        .optional()
        .describe(
          "How many days back to include labs. Defaults to 90.",
        ),
      includeRiskScores: z
        .boolean()
        .optional()
        .describe(
          "When false, omits the auto-selected risk-score block. Defaults to true.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        if (!pid) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a patientId or include SHARP patient context in _meta.",
              },
            ],
            isError: true,
          };
        }

        const client = buildClient(extra?._meta);
        const text = await clinicalHandoff(client, {
          patientId: pid,
          lookbackDays: params.lookbackDays,
          includeRiskScores: params.includeRiskScores,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating clinical handoff: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── draft_soap_note ──────────────────────────────────────────────────────
  server.tool(
    "draft_soap_note",
    "LLM-powered SOAP note drafter. Takes a visit reason and optional clinician subjective notes, grounds in the patient's longitudinal FHIR record, and returns a draft Subjective / Objective / Assessment / Plan note for clinician edit. Uses an OpenAI-compatible LLM (NOWBIND default, OpenAI fallback) configured via the MCP server's environment. This is a starting point for documentation, not a finalized clinical note.",
    {
      patientId: z
        .string()
        .optional()
        .describe(
          "FHIR Patient ID. Optional when provided via SHARP launch context in _meta.",
        ),
      visitReason: z
        .string()
        .describe(
          "Why the patient is presenting today, e.g. \"3-month diabetes follow-up\" or \"acute on chronic low back pain\".",
        ),
      clinicianNotes: z
        .string()
        .optional()
        .describe(
          "Optional clinician-supplied subjective notes — additional history, ROS, exam highlights — to include in the prompt.",
        ),
    },
    async (params, extra) => {
      try {
        const pid = resolvePatientId(params.patientId, extra?._meta);
        if (!pid) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a patientId or include SHARP patient context in _meta.",
              },
            ],
            isError: true,
          };
        }

        const client = buildClient(extra?._meta);
        const text = await draftSoapNote(client, {
          patientId: pid,
          visitReason: params.visitReason,
          clinicianNotes: params.clinicianNotes,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error drafting SOAP note: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
