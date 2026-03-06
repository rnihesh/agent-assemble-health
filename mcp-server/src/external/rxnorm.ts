// ──────────────────────────────────────────────────────────────────────────────
// NLM RxNorm REST API Client
// https://rxnav.nlm.nih.gov/REST
// ──────────────────────────────────────────────────────────────────────────────

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";

interface RxNormProperty {
  rxcui: string;
  name: string;
  synonym: string;
  tty: string;
  language: string;
}

interface InteractionConcept {
  minConceptItem: {
    rxcui: string;
    name: string;
    tty: string;
  };
  sourceConceptItem: {
    id: string;
    name: string;
    url: string;
  };
}

interface InteractionPair {
  interactionConcept: InteractionConcept[];
  severity?: string;
  description?: string;
}

interface InteractionTypeGroup {
  sourceDisclaimer?: string;
  sourceName: string;
  interactionType: {
    comment?: string;
    minConceptItem?: {
      rxcui: string;
      name: string;
      tty: string;
    };
    interactionPair: InteractionPair[];
  }[];
}

export interface RxNormInteractionResult {
  drug1: string;
  drug2: string;
  severity: string;
  description: string;
  source: string;
}

/**
 * Resolve a drug name to its RxCUI.
 */
export async function getRxCUI(drugName: string): Promise<string | null> {
  try {
    const url = `${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const idGroup = data?.idGroup;

    if (idGroup?.rxnormId?.length > 0) {
      return idGroup.rxnormId[0];
    }

    // Try approximate match if exact match fails
    const approxUrl = `${RXNORM_BASE}/approximateTerm.json?term=${encodeURIComponent(drugName)}&maxEntries=1`;
    const approxRes = await fetch(approxUrl);
    if (!approxRes.ok) return null;

    const approxData = await approxRes.json();
    const candidates = approxData?.approximateGroup?.candidate;
    if (candidates && candidates.length > 0) {
      return candidates[0].rxcui;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get drug properties by RxCUI.
 */
export async function getDrugInfo(
  rxcui: string,
): Promise<RxNormProperty | null> {
  try {
    const url = `${RXNORM_BASE}/rxcui/${rxcui}/properties.json`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    return (data?.properties as RxNormProperty) ?? null;
  } catch {
    return null;
  }
}

/**
 * Get interactions for a single RxCUI.
 */
export async function getInteractions(
  rxcui: string,
): Promise<RxNormInteractionResult[]> {
  try {
    const url = `${RXNORM_BASE}/interaction/interaction.json?rxcui=${rxcui}`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    return parseInteractionGroups(data?.interactionTypeGroup);
  } catch {
    return [];
  }
}

/**
 * Get interactions between multiple RxCUIs (drug-drug interactions).
 */
export async function getMultiInteractions(
  rxcuis: string[],
): Promise<RxNormInteractionResult[]> {
  if (rxcuis.length < 2) return [];

  try {
    const url = `${RXNORM_BASE}/interaction/list.json?rxcuis=${rxcuis.join("+")}`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const groups: InteractionTypeGroup[] =
      data?.fullInteractionTypeGroup ?? [];
    return parseInteractionGroups(groups);
  } catch {
    return [];
  }
}

function parseInteractionGroups(
  groups: InteractionTypeGroup[] | undefined,
): RxNormInteractionResult[] {
  if (!groups) return [];

  const results: RxNormInteractionResult[] = [];

  for (const group of groups) {
    for (const type of group.interactionType ?? []) {
      for (const pair of type.interactionPair ?? []) {
        const concepts = pair.interactionConcept ?? [];
        const drug1 = concepts[0]?.minConceptItem?.name ?? "Unknown";
        const drug2 = concepts[1]?.minConceptItem?.name ?? "Unknown";
        results.push({
          drug1,
          drug2,
          severity: pair.severity ?? "N/A",
          description: pair.description ?? "No description available",
          source: group.sourceName,
        });
      }
    }
  }

  return results;
}
