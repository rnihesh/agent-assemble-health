import type { FHIRClient } from "../client.js";
import type { AllergyIntolerance } from "../types.js";

/**
 * Fetch allergy/intolerance records for a patient.
 */
export async function getAllergies(
  client: FHIRClient,
  patientId: string,
): Promise<AllergyIntolerance[]> {
  return client.searchAll<AllergyIntolerance>("AllergyIntolerance", {
    patient: patientId,
    "clinical-status": "active",
    _count: "100",
  });
}
