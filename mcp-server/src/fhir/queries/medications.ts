import type { FHIRClient } from "../client.js";
import type { MedicationRequest } from "../types.js";

/**
 * Fetch active medication requests for a patient.
 * Includes status: active, completed (recent scripts still relevant).
 */
export async function getActiveMedications(
  client: FHIRClient,
  patientId: string,
): Promise<MedicationRequest[]> {
  const meds = await client.searchAll<MedicationRequest>("MedicationRequest", {
    patient: patientId,
    status: "active",
    _sort: "-authoredon",
    _count: "100",
  });

  return meds;
}

/**
 * Fetch all medication requests (any status) for a patient.
 */
export async function getAllMedications(
  client: FHIRClient,
  patientId: string,
): Promise<MedicationRequest[]> {
  return client.searchAll<MedicationRequest>("MedicationRequest", {
    patient: patientId,
    _sort: "-authoredon",
    _count: "100",
  });
}
