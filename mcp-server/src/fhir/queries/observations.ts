import type { FHIRClient } from "../client.js";
import type { Observation } from "../types.js";

export interface ObservationQueryOptions {
  category?: string; // e.g. "laboratory", "vital-signs"
  code?: string; // LOINC code or comma-separated list
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string; // yyyy-MM-dd
}

/**
 * Fetch observations for a patient with optional filters for category, code, and date range.
 */
export async function getObservations(
  client: FHIRClient,
  patientId: string,
  opts?: ObservationQueryOptions,
): Promise<Observation[]> {
  const params: Record<string, string> = {
    patient: patientId,
    _sort: "-date",
    _count: "200",
  };

  if (opts?.category) {
    params.category = opts.category;
  }
  if (opts?.code) {
    params.code = opts.code;
  }
  if (opts?.dateFrom && opts?.dateTo) {
    params.date = `ge${opts.dateFrom}`;
    // FHIR allows repeated params, but URLSearchParams won't do that easily,
    // so use a single range with le
    params["date"] = [`ge${opts.dateFrom}`, `le${opts.dateTo}`].join("&date=");
  } else if (opts?.dateFrom) {
    params.date = `ge${opts.dateFrom}`;
  } else if (opts?.dateTo) {
    params.date = `le${opts.dateTo}`;
  }

  return client.searchAll<Observation>("Observation", params);
}

/**
 * Fetch recent lab observations (within `lookbackDays`).
 */
export async function getRecentLabs(
  client: FHIRClient,
  patientId: string,
  lookbackDays: number = 90,
): Promise<Observation[]> {
  const from = new Date();
  from.setDate(from.getDate() - lookbackDays);
  const dateFrom = from.toISOString().split("T")[0];

  return getObservations(client, patientId, {
    category: "laboratory",
    dateFrom,
  });
}

/**
 * Fetch recent vital signs.
 */
export async function getRecentVitals(
  client: FHIRClient,
  patientId: string,
  lookbackDays: number = 90,
): Promise<Observation[]> {
  const from = new Date();
  from.setDate(from.getDate() - lookbackDays);
  const dateFrom = from.toISOString().split("T")[0];

  return getObservations(client, patientId, {
    category: "vital-signs",
    dateFrom,
  });
}
