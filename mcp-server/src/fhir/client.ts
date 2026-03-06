import type { Bundle, OperationOutcome, Resource } from "./types.js";

// ──────────────────────────────────────────────────────────────────────────────
// FHIR REST Client
// ──────────────────────────────────────────────────────────────────────────────

export class FHIRError extends Error {
  public readonly status: number;
  public readonly outcome?: OperationOutcome;

  constructor(message: string, status: number, outcome?: OperationOutcome) {
    super(message);
    this.name = "FHIRError";
    this.status = status;
    this.outcome = outcome;
  }
}

export class FHIRClient {
  private readonly baseUrl: string;
  private readonly accessToken?: string;

  constructor(baseUrl: string, accessToken?: string) {
    // Remove trailing slash for consistency
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.accessToken = accessToken;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/fhir+json",
      "Content-Type": "application/fhir+json",
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  private async request<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!res.ok) {
      let outcome: OperationOutcome | undefined;
      try {
        const body = await res.json();
        if (body?.resourceType === "OperationOutcome") {
          outcome = body as OperationOutcome;
        }
      } catch {
        // ignore parse errors
      }
      const msg = outcome?.issue?.[0]?.diagnostics ?? `FHIR request failed: ${res.status} ${res.statusText}`;
      throw new FHIRError(msg, res.status, outcome);
    }

    return (await res.json()) as T;
  }

  /**
   * Read a single resource by type and id.
   */
  async read<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    return this.request<T>(url);
  }

  /**
   * Search for resources. Returns the Bundle.
   */
  async search<T extends Resource>(
    resourceType: string,
    params: Record<string, string>,
  ): Promise<Bundle<T>> {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}/${resourceType}?${qs}`;
    return this.request<Bundle<T>>(url);
  }

  /**
   * Search and return only the resource entries (unwrapped from Bundle).
   */
  async searchEntries<T extends Resource>(
    resourceType: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const bundle = await this.search<T>(resourceType, params);
    return this.extractEntries<T>(bundle);
  }

  /**
   * Search with automatic pagination — follows Bundle.link "next" until all
   * pages are retrieved. Use with care on large result sets.
   */
  async searchAll<T extends Resource>(
    resourceType: string,
    params: Record<string, string>,
    maxPages: number = 10,
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 0;

    const qs = new URLSearchParams(params).toString();
    let url: string | null = `${this.baseUrl}/${resourceType}?${qs}`;

    while (url && page < maxPages) {
      const bundle: Bundle<T> = await this.request<Bundle<T>>(url);
      results.push(...this.extractEntries<T>(bundle));

      const nextLink = bundle.link?.find((l: { relation: string; url: string }) => l.relation === "next");
      url = nextLink?.url ?? null;
      page++;
    }

    return results;
  }

  /**
   * Extract typed resources from a Bundle response.
   */
  private extractEntries<T extends Resource>(bundle: Bundle<T>): T[] {
    if (!bundle.entry) return [];
    return bundle.entry
      .filter((e) => e.resource !== undefined)
      .map((e) => e.resource as T);
  }
}
