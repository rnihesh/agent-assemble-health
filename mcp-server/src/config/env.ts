import dotenv from "dotenv";

dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT ?? "3001", 10),
  FHIR_BASE_URL: process.env.FHIR_BASE_URL ?? "http://hapi.fhir.org/baseR4",
  FHIR_ACCESS_TOKEN: process.env.FHIR_ACCESS_TOKEN ?? undefined,
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  OPENFDA_API_KEY: process.env.OPENFDA_API_KEY ?? undefined,
} as const;
