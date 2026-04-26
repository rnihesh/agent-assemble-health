import type { SharpContext } from "./types.js";

/**
 * Canonical SHARP HTTP header names per the SHARP spec
 * (https://www.sharponmcp.com). Header reads are case-insensitive — these
 * are the canonical capitalization used in documentation; the resolver
 * lowercases input keys before lookup.
 */
export const SHARP_HEADERS = {
  patientId: "x-patient-id",
  fhirServerUrl: "x-fhir-server-url",
  fhirAccessToken: "x-fhir-access-token",
  fhirRefreshToken: "x-fhir-refresh-token",
  fhirRefreshUrl: "x-fhir-refresh-url",
} as const;

type HeaderRecord = Record<string, string | string[] | undefined>;

/**
 * Read a header value case-insensitively from a header record. Express
 * already lowercases incoming header names, but we normalize here so this
 * function works with any header-like dict (HTTP, Node.js IncomingHttpHeaders,
 * test fixtures, etc.).
 */
function readHeader(headers: HeaderRecord | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? undefined;
  }
  return undefined;
}

/**
 * Decode a JWT payload without verifying the signature. Returns the parsed
 * claims object on success, or null when the token is not a recognizable
 * JWT. We never trust this for authentication; it's only used to surface a
 * `patient` claim that SMART-on-FHIR launchers embed in the access token,
 * matching the reference implementation in po-community-mcp.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (typeof token !== "string" || token.length === 0) return null;
  // Strip a leading "Bearer " if present.
  const stripped = token.replace(/^bearer\s+/i, "").trim();
  const parts = stripped.split(".");
  if (parts.length !== 3) return null;

  try {
    // Base64url decode the payload (middle segment).
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    const claims = JSON.parse(json) as Record<string, unknown>;
    if (claims === null || typeof claims !== "object") return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * Extract the `patient` claim from a SMART-on-FHIR access token if present.
 * Returns the patient ID string or null.
 */
export function patientFromJwt(token: string | undefined): string | null {
  if (!token) return null;
  const claims = decodeJwtPayload(token);
  if (!claims) return null;
  const patient = claims.patient;
  if (typeof patient === "string" && patient.trim().length > 0) {
    return patient.trim();
  }
  return null;
}

/**
 * Extract SHARP context from canonical HTTP headers (the primary path per
 * the SHARP spec). Returns null when no patient identifier can be derived.
 *
 * Precedence rules:
 *   1. The `patient` claim of a JWT in `X-FHIR-Access-Token` wins over
 *      `X-Patient-ID`, matching po-community-mcp/typescript/fhir-utilities.ts.
 *   2. If no JWT-`patient` claim is present, fall back to `X-Patient-ID`.
 */
export function extractSharpContextFromHeaders(
  headers: HeaderRecord | undefined,
): SharpContext | null {
  const headerPatientId = readHeader(headers, SHARP_HEADERS.patientId)?.trim();
  const fhirServerUrl = readHeader(headers, SHARP_HEADERS.fhirServerUrl)?.trim();
  const fhirAccessToken = readHeader(headers, SHARP_HEADERS.fhirAccessToken)?.trim();
  const fhirRefreshToken = readHeader(headers, SHARP_HEADERS.fhirRefreshToken)?.trim();
  const fhirRefreshUrl = readHeader(headers, SHARP_HEADERS.fhirRefreshUrl)?.trim();

  // JWT patient claim takes precedence over the explicit header per spec.
  const jwtPatient = patientFromJwt(fhirAccessToken);
  const patientId = jwtPatient ?? (headerPatientId && headerPatientId.length > 0 ? headerPatientId : undefined);

  if (!patientId) return null;

  const ctx: SharpContext = { patientId };
  if (fhirServerUrl && fhirServerUrl.length > 0) ctx.fhirServerUrl = fhirServerUrl;
  if (fhirAccessToken && fhirAccessToken.length > 0) ctx.fhirAccessToken = fhirAccessToken;
  if (fhirRefreshToken && fhirRefreshToken.length > 0) ctx.fhirRefreshToken = fhirRefreshToken;
  if (fhirRefreshUrl && fhirRefreshUrl.length > 0) ctx.fhirRefreshUrl = fhirRefreshUrl;
  return ctx;
}

/**
 * Extracts SHARP (Substitutable Medical Apps, Reusable Technologies) context
 * from the MCP tool call _meta field. The _meta may carry launch-context
 * parameters such as patient_id, fhir_server_url, and fhir_access_token that
 * were injected by the hosting EHR or SMART-on-FHIR launcher.
 *
 * This is the legacy/secondary transport — the dashboard's REST→tool calls
 * route context through `_meta`. Canonical HTTP headers (see
 * `extractSharpContextFromHeaders`) are the primary SHARP transport.
 */
export function extractSharpContext(meta: unknown): SharpContext | null {
  if (meta === null || meta === undefined || typeof meta !== "object") {
    return null;
  }

  const record = meta as Record<string, unknown>;

  const patientId = record.patient_id;
  if (typeof patientId !== "string" || patientId.trim().length === 0) {
    return null;
  }

  const context: SharpContext = {
    patientId: patientId.trim(),
  };

  if (typeof record.fhir_server_url === "string" && record.fhir_server_url.trim().length > 0) {
    context.fhirServerUrl = record.fhir_server_url.trim();
  }

  if (typeof record.fhir_access_token === "string" && record.fhir_access_token.trim().length > 0) {
    context.fhirAccessToken = record.fhir_access_token.trim();
  }

  return context;
}

/**
 * Resolve SHARP context from any combination of inputs the MCP tool layer
 * can see. Canonical HTTP headers are the primary path; the `_meta` JSON-RPC
 * field is the fallback used by the in-app dashboard's REST→tool bridge.
 */
export function resolveSharpContext(
  headers: HeaderRecord | undefined,
  meta: unknown,
): SharpContext | null {
  const fromHeaders = extractSharpContextFromHeaders(headers);
  if (fromHeaders) return fromHeaders;
  return extractSharpContext(meta);
}
