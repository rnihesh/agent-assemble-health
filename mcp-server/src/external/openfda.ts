// ──────────────────────────────────────────────────────────────────────────────
// OpenFDA Drug Label API Client
// https://api.fda.gov/drug/label.json
// ──────────────────────────────────────────────────────────────────────────────

import { ENV } from "../config/env.js";

const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";

interface OpenFDALabel {
  drug_interactions?: string[];
  warnings?: string[];
  contraindications?: string[];
  boxed_warning?: string[];
  warnings_and_cautions?: string[];
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    rxcui?: string[];
    substance_name?: string[];
    pharm_class_epc?: string[];
  };
}

interface OpenFDAResponse {
  meta?: {
    results?: {
      total: number;
    };
  };
  results?: OpenFDALabel[];
}

export interface DrugLabelInfo {
  brandNames: string[];
  genericNames: string[];
  pharmClasses: string[];
  interactions: string[];
  warnings: string[];
  contraindications: string[];
  boxedWarnings: string[];
}

/**
 * Build the query URL with an optional API key.
 */
function buildUrl(searchTerm: string, limit: number = 1): string {
  const params = new URLSearchParams({
    search: searchTerm,
    limit: String(limit),
  });
  if (ENV.OPENFDA_API_KEY) {
    params.set("api_key", ENV.OPENFDA_API_KEY);
  }
  return `${OPENFDA_BASE}?${params.toString()}`;
}

/**
 * Search for a drug label by drug name (checks both brand_name and generic_name).
 */
export async function searchDrugLabel(
  drugName: string,
): Promise<DrugLabelInfo | null> {
  const query = `openfda.brand_name:"${drugName}"+openfda.generic_name:"${drugName}"`;
  try {
    const res = await fetch(buildUrl(query));
    if (!res.ok) return null;

    const data: OpenFDAResponse = await res.json();
    const label = data.results?.[0];
    if (!label) return null;

    return {
      brandNames: label.openfda?.brand_name ?? [],
      genericNames: label.openfda?.generic_name ?? [],
      pharmClasses: label.openfda?.pharm_class_epc ?? [],
      interactions: label.drug_interactions ?? [],
      warnings: [
        ...(label.warnings ?? []),
        ...(label.warnings_and_cautions ?? []),
      ],
      contraindications: label.contraindications ?? [],
      boxedWarnings: label.boxed_warning ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Extract drug interaction text from the label.
 */
export async function getDrugInteractions(
  drugName: string,
): Promise<string[]> {
  const label = await searchDrugLabel(drugName);
  return label?.interactions ?? [];
}

/**
 * Extract warnings and contraindications from the label.
 */
export async function getDrugWarnings(
  drugName: string,
): Promise<{ warnings: string[]; contraindications: string[]; boxedWarnings: string[] }> {
  const label = await searchDrugLabel(drugName);
  return {
    warnings: label?.warnings ?? [],
    contraindications: label?.contraindications ?? [],
    boxedWarnings: label?.boxedWarnings ?? [],
  };
}
