import type { SharpContext } from "./types.js";

/**
 * Extracts SHARP (Substitutable Medical Apps, Reusable Technologies) context
 * from the MCP tool call _meta field. The _meta may carry launch-context
 * parameters such as patient_id, fhir_server_url, and fhir_access_token that
 * were injected by the hosting EHR or SMART-on-FHIR launcher.
 */
export function extractSharpContext(meta: unknown): SharpContext | null {
  if (meta === null || meta === undefined || typeof meta !== "object") {
    return null;
  }

  const record = meta as Record<string, unknown>;

  const patientId = record.patient_id;
  if (typeof patientId !== "string" || patientId.trim().length === 0) {
    return null;
  }

  const context: SharpContext = {
    patientId: patientId.trim(),
  };

  if (typeof record.fhir_server_url === "string" && record.fhir_server_url.trim().length > 0) {
    context.fhirServerUrl = record.fhir_server_url.trim();
  }

  if (typeof record.fhir_access_token === "string" && record.fhir_access_token.trim().length > 0) {
    context.fhirAccessToken = record.fhir_access_token.trim();
  }

  return context;
}
