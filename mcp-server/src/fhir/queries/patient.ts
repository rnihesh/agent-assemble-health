import type { FHIRClient } from "../client.js";
import type { Patient } from "../types.js";

/**
 * Fetch a single Patient resource by id.
 */
export async function getPatient(client: FHIRClient, id: string): Promise<Patient> {
  return client.read<Patient>("Patient", id);
}
