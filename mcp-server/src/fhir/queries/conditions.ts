import type { FHIRClient } from "../client.js";
import type { Condition } from "../types.js";

/**
 * Fetch active conditions for a patient.
 * Includes conditions with clinical-status = active, recurrence, relapse.
 */
export async function getConditions(client: FHIRClient, patientId: string): Promise<Condition[]> {
  const conditions = await client.searchAll<Condition>("Condition", {
    patient: patientId,
    "clinical-status": "active,recurrence,relapse",
    _sort: "-onset-date",
    _count: "100",
  });

  return conditions;
}

/**
 * Fetch all conditions for a patient (regardless of clinical status).
 */
export async function getAllConditions(client: FHIRClient, patientId: string): Promise<Condition[]> {
  return client.searchAll<Condition>("Condition", {
    patient: patientId,
    _sort: "-onset-date",
    _count: "100",
  });
}
