import type { FHIRClient } from "../client.js";
import type { Immunization } from "../types.js";

/**
 * Fetch immunization records for a patient.
 */
export async function getImmunizations(
  client: FHIRClient,
  patientId: string,
): Promise<Immunization[]> {
  return client.searchAll<Immunization>("Immunization", {
    patient: patientId,
    _sort: "-date",
    _count: "100",
  });
}
