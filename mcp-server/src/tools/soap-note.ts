import type { FHIRClient } from "../fhir/client.js";
import { patientSummary } from "./patient-summary.js";
import {
  buildLLMClient,
  LLM_NOT_CONFIGURED_MESSAGE,
  type LLMClientConfig,
} from "../external/llm.js";

export interface SoapNoteInput {
  patientId: string;
  /** What brought the patient in. Required. */
  visitReason: string;
  /** Optional clinician-supplied subjective notes / additional context. */
  clinicianNotes?: string;
  /**
   * Optional. ISO 639-1 code or language name (e.g. "es", "Spanish",
   * "Hindi"). Defaults to English. The four SOAP sections are written in
   * this language; the document headers stay English so a clinician can
   * still scan the structure.
   */
  language?: string;
}

interface LLMSoapResponse {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

const SYSTEM_PROMPT = `You are a clinical decision support agent assisting a licensed clinician with note drafting.

Given a patient's longitudinal FHIR record summary plus a visit reason and optional clinician notes, draft a four-part SOAP note (Subjective / Objective / Assessment / Plan). Each section must be grounded in evidence from the patient's record. When a finding has a FHIR resource reference (formatted like \`Condition/abc-123\`), include that reference verbatim — clinicians use them to audit citations.

Respond ONLY in JSON matching this schema:

{
  "subjective": "string — patient's reported reason for the visit, history of present illness in clinician shorthand, relevant ROS",
  "objective": "string — vital signs, exam findings, recent labs / imaging cited with FHIR refs",
  "assessment": "string — ranked problem list with brief reasoning per problem; cite chronic conditions",
  "plan": "string — numbered actions: workup, medication changes, referrals, patient education, follow-up timing"
}

Rules:
- Use clinical shorthand and bullets where helpful, but the JSON values are plain Markdown strings.
- Be conservative; do not invent findings the record doesn't support.
- Frame this as a draft for the clinician to edit, not a final note.
- This is decision support; do not diagnose, do not prescribe.`;

const MAX_PATIENT_SUMMARY_CHARS = 6000;

export async function draftSoapNote(
  client: FHIRClient,
  input: SoapNoteInput,
  options: { llmConfig?: LLMClientConfig | null } = {},
): Promise<string> {
  if (!input.visitReason || input.visitReason.trim().length === 0) {
    return errorMarkdown(
      "Visit reason is required.",
      "Provide a `visitReason` describing why the patient is presenting today, e.g. \"3-month diabetes follow-up\" or \"acute on chronic low back pain\".",
    );
  }

  const llm =
    options.llmConfig === undefined ? buildLLMClient() : options.llmConfig;
  if (!llm) {
    return errorMarkdown("LLM provider not configured.", LLM_NOT_CONFIGURED_MESSAGE);
  }

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

  let parsed: LLMSoapResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return errorMarkdown(
      "LLM returned malformed JSON.",
      "Raw output:\n\n```\n" + raw.slice(0, 800) + "\n```",
    );
  }

  if (
    !parsed.subjective ||
    !parsed.objective ||
    !parsed.assessment ||
    !parsed.plan
  ) {
    return errorMarkdown(
      "LLM response missing one or more required SOAP sections.",
      "Raw output:\n\n```\n" + raw.slice(0, 800) + "\n```",
    );
  }

  return renderMarkdown(input, parsed, llm);
}

function buildUserPrompt(input: SoapNoteInput, summary: string): string {
  const parts: string[] = [];
  const language = (input.language ?? "English").trim() || "English";
  if (language.toLowerCase() !== "english") {
    parts.push(`# Output language`);
    parts.push(
      `Write the four SOAP-section values in ${language}. Keep the JSON keys (subjective / objective / assessment / plan) and any FHIR resource references like \`Condition/abc-123\` exactly as they are.`,
    );
    parts.push("");
  }
  parts.push(`# Visit Reason`);
  parts.push(input.visitReason.trim());
  parts.push("");
  if (input.clinicianNotes && input.clinicianNotes.trim().length > 0) {
    parts.push("# Clinician Notes (Subjective input)");
    parts.push(input.clinicianNotes.trim());
    parts.push("");
  }
  parts.push("# Patient Record Summary (FHIR)");
  parts.push(summary);
  return parts.join("\n");
}

function renderMarkdown(
  input: SoapNoteInput,
  resp: LLMSoapResponse,
  llm: LLMClientConfig,
): string {
  const lines: string[] = [];
  lines.push("# SOAP Note (draft)");
  lines.push("");
  lines.push(`**Visit Reason:** ${input.visitReason.trim()}`);
  if (input.language && input.language.trim().toLowerCase() !== "english") {
    lines.push(`**Language:** ${input.language.trim()}`);
  }
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## S — Subjective");
  lines.push("");
  lines.push(resp.subjective.trim());
  lines.push("");

  lines.push("## O — Objective");
  lines.push("");
  lines.push(resp.objective.trim());
  lines.push("");

  lines.push("## A — Assessment");
  lines.push("");
  lines.push(resp.assessment.trim());
  lines.push("");

  lines.push("## P — Plan");
  lines.push("");
  lines.push(resp.plan.trim());
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(
    `*Drafted by ${llm.provider}/${llm.model}. This is a starting point for the clinician to edit, not a final clinical note. Verify every claim against the chart before signing.*`,
  );

  return lines.join("\n");
}

function errorMarkdown(title: string, detail: string): string {
  return [
    "# SOAP Note (draft)",
    "",
    `> **${title}**`,
    "",
    detail,
    "",
    "---",
    "",
    "*This tool requires (1) a configured LLM provider in the MCP server's environment, (2) a patient ID, and (3) a visit reason.*",
  ].join("\n");
}
