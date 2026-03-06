import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FHIRClient } from "./fhir/client.js";
import { ENV } from "./config/env.js";
import { extractSharpContext } from "./auth/sharp-context.js";
import { patientSummary } from "./tools/patient-summary.js";
import { checkDrugInteractions } from "./tools/drug-interaction.js";
import { interpretLabResults } from "./tools/lab-interpreter.js";
import { calculateRiskScore } from "./tools/risk-calculator.js";
import { identifyCareGaps } from "./tools/care-gap-identifier.js";
import { matchClinicalGuidelines } from "./tools/guideline-matcher.js";

/**
 * Build a FHIRClient from the tool _meta context (SHARP) or fall back to
 * environment defaults.
 */
function buildClient(meta: unknown): FHIRClient {
  const sharp = extractSharpContext(meta);
  const baseUrl = sharp?.fhirServerUrl ?? ENV.FHIR_BASE_URL;
  const token = sharp?.fhirAccessToken ?? ENV.FHIR_ACCESS_TOKEN;
  return new FHIRClient(baseUrl, token);
}

/**
 * Resolve the patientId from either the explicit input or the SHARP _meta context.
 */
function resolvePatientId(
  inputPatientId: string | undefined,
  meta: unknown,
): string | undefined {
  if (inputPatientId) return inputPatientId;
  const sharp = extractSharpContext(meta);
  return sharp?.patientId;
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "medassist",
    version: "1.0.0",
  });

  // ── patient_summary ──────────────────────────────────────────────────────
  server.tool(
    "patient_summary",
    "Generates a comprehensive clinical summary for a patient, including demographics, active conditions, medications, allergies, recent lab results, vitals, and immunizations. Data is fetched from a FHIR R4 server.",
    {
      patientId: z
        .string()
        .describe("The FHIR Patient resource ID."),
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
        const client = buildClient(extra?._meta);
        const text = await patientSummary(client, {
          patientId: params.patientId,
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
        .describe("The FHIR Patient resource ID."),
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
        const client = buildClient(extra?._meta);
        const text = await interpretLabResults(client, {
          patientId: params.patientId,
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
        .describe("The FHIR Patient resource ID."),
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
        const client = buildClient(extra?._meta);
        const text = await calculateRiskScore(client, {
          patientId: params.patientId,
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
        .describe("The FHIR Patient resource ID."),
    },
    async (params, extra) => {
      try {
        const client = buildClient(extra?._meta);
        const text = await identifyCareGaps(client, {
          patientId: params.patientId,
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

  return server;
}
