import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../.env");

// Allow local overrides from the current working directory, while still
// supporting the repo-root .env used by the helper scripts.
dotenv.config();
dotenv.config({ path: rootEnvPath });

export const ENV = {
  PORT: parseInt(process.env.PORT ?? process.env.MCP_SERVER_PORT ?? "3001", 10),
  FHIR_BASE_URL: process.env.FHIR_BASE_URL ?? "http://hapi.fhir.org/baseR4",
  FHIR_ACCESS_TOKEN: process.env.FHIR_ACCESS_TOKEN ?? undefined,
  AGENT_PUBLIC_URL:
    process.env.AGENT_PUBLIC_URL ??
    `http://localhost:${process.env.AGENT_PORT ?? "8001"}`,
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  OPENFDA_API_KEY: process.env.OPENFDA_API_KEY ?? undefined,

  // ── LLM (differential_diagnosis tool) ────────────────────────────────────
  // Provider precedence: NOWBIND first, then OpenAI direct.
  NOWBIND_API_KEY: process.env.NOWBIND_AGENT_OPENAI_API_KEY ?? undefined,
  NOWBIND_BASE_URL: process.env.NOWBIND_AGENT_OPENAI_BASE_URL ?? undefined,
  NOWBIND_MODEL: process.env.NOWBIND_AGENT_OPENAI_MODEL ?? "gpt-4o",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? undefined,
  OPENAI_DEFAULT_MODEL: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4o-mini",
} as const;
