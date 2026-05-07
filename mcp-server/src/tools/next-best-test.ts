import type { FHIRClient } from "../fhir/client.js";
import { patientSummary } from "./patient-summary.js";
import {
  buildLLMClient,
  LLM_NOT_CONFIGURED_MESSAGE,
  type LLMClientConfig,
} from "../external/llm.js";

export interface NextBestTestInput {
  patientId: string;
  /** Chief complaint or presentation. Required. */
  chiefComplaint: string;
  /**
   * Optional list of differential candidates (e.g. ["CHF", "CKD progression",
   * "nephrotic syndrome"]). When provided the LLM ranks tests by how much
   * each one narrows this candidate set.
   */
  candidates?: string[];
}

interface RankedTest {
  test: string;
  rationale: string;
  expectedDiscrimination: "High" | "Medium" | "Low";
  ifPositive: string;
  ifNegative: string;
  costContext?: string;
  cptOrLoinc?: string;
}

interface LLMResponse {
  topTest: RankedTest;
  alternativeTests: RankedTest[];
}

const SYSTEM_PROMPT = `You are a clinical decision support agent helping a clinician decide what to order next.

Given a patient's record, a chief complaint, and an optional list of differential candidates, identify the single test (lab, imaging, or focused exam) that would most efficiently narrow the differential, plus a few strong alternatives.

Reason about discrimination value: a test that splits the candidate set in half is worth more than one that confirms a candidate already favored by the prior. Bayesian thinking, not maximalism.

Respond ONLY in JSON:

{
  "topTest": {
    "test": "string (e.g. 'BNP / NT-proBNP')",
    "rationale": "one paragraph — why this test, what does each result tell you",
    "expectedDiscrimination": "High" | "Medium" | "Low",
    "ifPositive": "what changes in management if positive",
    "ifNegative": "what changes if negative",
    "costContext": "string (optional — e.g. 'point-of-care, low cost' or 'requires imaging suite')",
    "cptOrLoinc": "string (optional)"
  },
  "alternativeTests": [
    { same shape, 2-4 entries }
  ]
}

Rules:
- Ground in the patient's actual record. If a recent value is present, suggest the next decisional test rather than re-checking what the chart already shows.
- Prefer tests that genuinely narrow the differential over tests that confirm the most likely candidate.
- This is decision support; do not order anything, do not diagnose.`;

const MAX_PATIENT_SUMMARY_CHARS = 6000;

export async function nextBestTest(
  client: FHIRClient,
  input: NextBestTestInput,
  options: { llmConfig?: LLMClientConfig | null } = {},
): Promise<string> {
  if (!input.chiefComplaint || input.chiefComplaint.trim().length === 0) {
    return errorMarkdown(
      "Chief complaint is required.",
      "Provide a `chiefComplaint` describing the presentation. Differential candidates are optional.",
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

  const userParts: string[] = [];
  userParts.push("# Chief Complaint");
  userParts.push(input.chiefComplaint.trim());
  userParts.push("");
  if (input.candidates && input.candidates.length > 0) {
    userParts.push("# Working Differential");
    userParts.push(input.candidates.map((c) => `- ${c}`).join("\n"));
    userParts.push("");
  }
  userParts.push("# Patient Record Summary (FHIR)");
  userParts.push(truncated);

  let raw: string;
  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userParts.join("\n") },
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

  if (!parsed.topTest || !parsed.topTest.test) {
    return errorMarkdown(
      "LLM did not nominate a top test.",
      "Raw output:\n\n```\n" + raw.slice(0, 800) + "\n```",
    );
  }

  return renderMarkdown(input, parsed, llm);
}

function renderMarkdown(
  input: NextBestTestInput,
  resp: LLMResponse,
  llm: LLMClientConfig,
): string {
  const lines: string[] = [];
  lines.push("# Next Best Test");
  lines.push("");
  lines.push(`**Chief Complaint:** ${input.chiefComplaint.trim()}`);
  if (input.candidates && input.candidates.length > 0) {
    lines.push(`**Working Differential:** ${input.candidates.join("; ")}`);
  }
  lines.push("");

  lines.push(`## Recommended: ${resp.topTest.test}`);
  if (resp.topTest.cptOrLoinc) {
    lines.push(`*${resp.topTest.cptOrLoinc}*`);
  }
  lines.push("");
  lines.push(`**Discrimination:** ${resp.topTest.expectedDiscrimination}`);
  if (resp.topTest.costContext) {
    lines.push(`**Context:** ${resp.topTest.costContext}`);
  }
  lines.push("");
  lines.push("**Rationale**");
  lines.push("");
  lines.push(resp.topTest.rationale);
  lines.push("");
  lines.push("**If positive**");
  lines.push("");
  lines.push(resp.topTest.ifPositive);
  lines.push("");
  lines.push("**If negative**");
  lines.push("");
  lines.push(resp.topTest.ifNegative);
  lines.push("");

  if (resp.alternativeTests && resp.alternativeTests.length > 0) {
    lines.push("## Alternative Tests");
    lines.push("");
    resp.alternativeTests.forEach((t, i) => {
      lines.push(`### ${i + 1}. ${t.test} — ${t.expectedDiscrimination}`);
      if (t.cptOrLoinc) lines.push(`*${t.cptOrLoinc}*`);
      if (t.costContext) lines.push(`**Context:** ${t.costContext}`);
      lines.push("");
      lines.push(t.rationale);
      lines.push("");
      lines.push(`**If positive:** ${t.ifPositive}`);
      lines.push(`**If negative:** ${t.ifNegative}`);
      lines.push("");
    });
  }

  lines.push("---");
  lines.push("");
  lines.push(
    `*Generated by ${llm.provider}/${llm.model}. Decision support only — clinician judgment governs ordering.*`,
  );
  return lines.join("\n");
}

function errorMarkdown(title: string, detail: string): string {
  return [
    "# Next Best Test",
    "",
    `> **${title}**`,
    "",
    detail,
    "",
    "---",
    "",
    "*This tool requires (1) a configured LLM provider, (2) a patient ID, and (3) a chief complaint. Differential candidates are optional but improve discrimination.*",
  ].join("\n");
}
