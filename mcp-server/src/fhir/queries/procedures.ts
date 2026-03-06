import type { FHIRClient } from "../client.js";
import type { Procedure } from "../types.js";

/**
 * Fetch procedure records for a patient.
 */
export async function getProcedures(
  client: FHIRClient,
  patientId: string,
): Promise<Procedure[]> {
  return client.searchAll<Procedure>("Procedure", {
    patient: patientId,
    _sort: "-date",
    _count: "100",
  });
}
