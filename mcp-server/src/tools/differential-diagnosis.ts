import type { FHIRClient } from "../fhir/client.js";
import { patientSummary } from "./patient-summary.js";
import {
  buildLLMClient,
  LLM_NOT_CONFIGURED_MESSAGE,
  type LLMClientConfig,
} from "../external/llm.js";

export interface DifferentialDiagnosisInput {
  patientId: string;
  chiefComplaint: string;
  additionalContext?: string;
}

interface RankedCandidate {
  diagnosis: string;
  likelihood: "High" | "Medium" | "Low";
  supportingFindings: string[];
  contradictingFindings: string[];
  recommendedNextSteps: string[];
  icdOrSnomedCode?: string;
}

interface LLMResponse {
  candidates: RankedCandidate[];
  reasoningSummary?: string;
}

const SYSTEM_PROMPT = `You are a clinical decision support agent assisting a licensed clinician.

Given a patient's longitudinal FHIR record summary and a chief complaint, produce a ranked differential diagnosis. For each candidate, ground your reasoning in specific findings from the patient's record. When a finding has a FHIR resource reference (formatted like \`Condition/abc-123\`), include that reference verbatim in the supporting evidence — this lets the clinician audit the citation.

Respond ONLY in JSON matching this exact schema:

{
  "candidates": [
    {
      "diagnosis": "string",
      "likelihood": "High" | "Medium" | "Low",
      "supportingFindings": ["string"],
      "contradictingFindings": ["string"],
      "recommendedNextSteps": ["string"],
      "icdOrSnomedCode": "string (optional)"
    }
  ],
  "reasoningSummary": "string (one paragraph synthesizing your overall thinking)"
}

Rules:
- Return 3 to 5 candidates, ordered by likelihood (High > Medium > Low).
- Each supportingFindings entry should be a concise clinical statement, e.g. "Long-standing T2DM with proteinuria (Condition/...)".
- Be conservative with "High" — reserve it for findings that strongly point to the diagnosis.
- Include red-flag candidates that must not be missed, even if less likely.
- Recommend specific, actionable next steps (labs, imaging, referrals, focused exam).
- This is decision support only; do not diagnose, do not prescribe. Frame every claim as hypothesis.`;

const MAX_PATIENT_SUMMARY_CHARS = 6000;

export async function differentialDiagnosis(
  client: FHIRClient,
  input: DifferentialDiagnosisInput,
  options: { llmConfig?: LLMClientConfig | null } = {},
): Promise<string> {
  if (!input.chiefComplaint || input.chiefComplaint.trim().length === 0) {
    return errorMarkdown(
      "Chief complaint is required.",
      "Provide a `chiefComplaint` describing the presentation, e.g. \"65yo F, progressive fatigue and edema over 6 weeks\".",
    );
  }

  const llm =
    options.llmConfig === undefined ? buildLLMClient() : options.llmConfig;
  if (!llm) {
    return errorMarkdown("LLM provider not configured.", LLM_NOT_CONFIGURED_MESSAGE);
  }

  // Ground the prompt in the patient's record. patientSummary already emits
  // FHIR resource citations from iteration 2; the LLM sees them and can
  // re-cite supporting findings.
  let summaryMarkdown: string;
  try {
    summaryMarkdown = await patientSummary(client, { patientId: input.patientId });
  } catch (err) {
    return errorMarkdown(
      "Could not load patient grounding context.",
      err instanceof Error ? err.message : String(err),
    );
  }

  const truncated =
    summaryMarkdown.length > MAX_PATIENT_SUMMARY_CHARS
      ? summaryMarkdown.slice(0, MAX_PATIENT_SUMMARY_CHARS) +
        "\n\n[truncated for token budget]"
      : summaryMarkdown;

  const userPrompt = buildUserPrompt(input, truncated);

  let raw: string;
  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1500,
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return errorMarkdown(
      "LLM call failed.",
      err instanceof Error ? err.message : String(err),
    );
  }

  let parsed: LLMResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return errorMarkdown(
      "LLM returned malformed JSON.",
      "Raw output:\n\n```\n" + raw.slice(0, 800) + "\n```",
    );
  }

  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    return errorMarkdown(
      "LLM did not return any differential candidates.",
      "Raw output:\n\n```\n" + raw.slice(0, 800) + "\n```",
    );
  }

  return renderMarkdown(input, parsed, llm);
}

function buildUserPrompt(
  input: DifferentialDiagnosisInput,
  patientSummaryMd: string,
): string {
  const parts: string[] = [];
  parts.push(`# Chief Complaint`);
  parts.push(input.chiefComplaint.trim());
  parts.push("");
  if (input.additionalContext && input.additionalContext.trim().length > 0) {
    parts.push("# Additional Context");
    parts.push(input.additionalContext.trim());
    parts.push("");
  }
  parts.push("# Patient Record Summary (FHIR)");
  parts.push(patientSummaryMd);
  return parts.join("\n");
}

function renderMarkdown(
  input: DifferentialDiagnosisInput,
  resp: LLMResponse,
  llm: LLMClientConfig,
): string {
  const lines: string[] = [];
  lines.push("# Differential Diagnosis");
  lines.push("");
  lines.push(`**Chief Complaint:** ${input.chiefComplaint.trim()}`);
  if (input.additionalContext && input.additionalContext.trim().length > 0) {
    lines.push(`**Additional Context:** ${input.additionalContext.trim()}`);
  }
  lines.push("");

  if (resp.reasoningSummary && resp.reasoningSummary.trim().length > 0) {
    lines.push("## Synthesis");
    lines.push("");
    lines.push(resp.reasoningSummary.trim());
    lines.push("");
  }

  lines.push("## Ranked Candidates");
  lines.push("");
  resp.candidates.forEach((c, idx) => {
    const code = c.icdOrSnomedCode ? ` (${c.icdOrSnomedCode})` : "";
    lines.push(`### ${idx + 1}. ${c.diagnosis}${code} — ${c.likelihood} likelihood`);
    lines.push("");
    if (c.supportingFindings.length > 0) {
      lines.push("**Supporting findings**");
      for (const s of c.supportingFindings) lines.push(`- ${s}`);
      lines.push("");
    }
    if (c.contradictingFindings.length > 0) {
      lines.push("**Contradicting findings**");
      for (const s of c.contradictingFindings) lines.push(`- ${s}`);
      lines.push("");
    }
    if (c.recommendedNextSteps.length > 0) {
      lines.push("**Recommended next steps**");
      for (const s of c.recommendedNextSteps) lines.push(`- ${s}`);
      lines.push("");
    }
  });

  lines.push("---");
  lines.push("");
  lines.push(
    `*Generated by ${llm.provider}/${llm.model}. This is decision support only — every candidate is a hypothesis. Correlate with the full clinical picture before acting.*`,
  );

  return lines.join("\n");
}

function errorMarkdown(title: string, detail: string): string {
  return [
    "# Differential Diagnosis",
    "",
    `> **${title}**`,
    "",
    detail,
    "",
    "---",
    "",
    "*This tool requires (1) a configured LLM provider in the MCP server's environment and (2) a patient ID and chief complaint.*",
  ].join("\n");
}
