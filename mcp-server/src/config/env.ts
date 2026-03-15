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
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  OPENFDA_API_KEY: process.env.OPENFDA_API_KEY ?? undefined,
} as const;
