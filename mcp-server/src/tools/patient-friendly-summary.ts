import type { FHIRClient } from "../fhir/client.js";
import { patientSummary } from "./patient-summary.js";
import {
  buildLLMClient,
  LLM_NOT_CONFIGURED_MESSAGE,
  type LLMClientConfig,
} from "../external/llm.js";

export interface PatientFriendlySummaryInput {
  patientId: string;
  /**
   * Optional. ISO 639-1 code or English language name. Defaults to English.
   * The LLM produces the summary in this language.
   */
  language?: string;
  /**
   * Optional. Reading level. Defaults to "6th grade" — accessible to most
   * adult patients in the United States.
   */
  readingLevel?: string;
}

const SYSTEM_PROMPT = `You are a patient-education writer working from a clinician's chart summary. Translate the structured FHIR-backed record into plain language a patient can understand.

Rules:
- Use the requested reading level. Default is 6th grade.
- Use the requested language. Default is English.
- Strip clinical jargon. "Hypertension" -> "high blood pressure". "Hyperlipidemia" -> "high cholesterol". "Microalbuminuria" -> "small amounts of protein in the urine, which can be an early sign of kidney strain".
- Group by category the patient cares about: Your conditions, Your medications, Your allergies, Recent test results, Your shots / vaccines.
- Do not include FHIR resource references in this output — they're a clinician audit trail, not patient-facing.
- Do not invent details the record does not contain.
- Add a one-paragraph "What this means for you" gentle summary at the end. No alarm, no medical advice, no diagnosis. Encourage talking to the clinician about anything unclear.

Respond ONLY with the patient-facing Markdown.`;

const MAX_PATIENT_SUMMARY_CHARS = 6000;

export async function patientFriendlySummary(
  client: FHIRClient,
  input: PatientFriendlySummaryInput,
  options: { llmConfig?: LLMClientConfig | null } = {},
): Promise<string> {
  const language = (input.language ?? "English").trim() || "English";
  const readingLevel = (input.readingLevel ?? "6th grade").trim() || "6th grade";

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

  const userPrompt = [
    `# Audience and tone`,
    `Language: ${language}`,
    `Reading level: ${readingLevel}`,
    ``,
    `# Clinician chart summary (do not copy verbatim — translate)`,
    truncated,
  ].join("\n");

  let body: string;
  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });
    body = completion.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return errorMarkdown(
      "LLM call failed.",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!body || body.trim().length === 0) {
    return errorMarkdown(
      "LLM returned an empty response.",
      "Try again, or use a different model.",
    );
  }

  const lines: string[] = [];
  lines.push("# Your Health Summary");
  lines.push("");
  lines.push(`*Language: ${language} · Reading level: ${readingLevel}*`);
  lines.push("");
  lines.push(body.trim());
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `*Drafted by ${llm.provider}/${llm.model}. This is information from your medical record translated into plain language. It is not medical advice. Talk to your clinician about anything unclear.*`,
  );
  return lines.join("\n");
}

function errorMarkdown(title: string, detail: string): string {
  return [
    "# Your Health Summary",
    "",
    `> **${title}**`,
    "",
    detail,
    "",
    "---",
    "",
    "*This tool requires (1) a configured LLM provider and (2) a patient ID.*",
  ].join("\n");
}
