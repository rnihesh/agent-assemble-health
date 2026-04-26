import { describe, expect, it } from "vitest";
import {
  decodeJwtPayload,
  extractSharpContext,
  extractSharpContextFromHeaders,
  patientFromJwt,
  resolveSharpContext,
  SHARP_HEADERS,
} from "../src/auth/sharp-context.js";
import { resolvePatientId } from "../src/server.js";
import { runWithRequestHeaders } from "../src/auth/request-headers.js";

// ---------------------------------------------------------------------------
// Helpers — build a JWT-shaped string with a `patient` claim. We never verify
// signatures (decode-only path), so the alg/sig content doesn't matter.
// ---------------------------------------------------------------------------

function b64url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

// ---------------------------------------------------------------------------
// extractSharpContext (legacy _meta path — preserved for the in-app dashboard)
// ---------------------------------------------------------------------------

describe("extractSharpContext (_meta fallback)", () => {
  it("returns null for non-object metadata", () => {
    expect(extractSharpContext(null)).toBeNull();
    expect(extractSharpContext("bad-meta")).toBeNull();
  });

  it("extracts patient and FHIR connection details from SHARP _meta", () => {
    expect(
      extractSharpContext({
        patient_id: "patient-123",
        fhir_server_url: "https://fhir.example.com/r4",
        fhir_access_token: "secret-token",
      }),
    ).toEqual({
      patientId: "patient-123",
      fhirServerUrl: "https://fhir.example.com/r4",
      fhirAccessToken: "secret-token",
    });
  });

  it("ignores blank patient IDs", () => {
    expect(
      extractSharpContext({
        patient_id: "   ",
        fhir_server_url: "https://fhir.example.com/r4",
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractSharpContextFromHeaders (canonical SHARP HTTP headers — primary path)
// ---------------------------------------------------------------------------

describe("extractSharpContextFromHeaders (canonical headers)", () => {
  it("returns null when no headers are present", () => {
    expect(extractSharpContextFromHeaders(undefined)).toBeNull();
    expect(extractSharpContextFromHeaders({})).toBeNull();
  });

  it("populates context from all three canonical SHARP headers", () => {
    expect(
      extractSharpContextFromHeaders({
        "X-Patient-ID": "patient-abc",
        "X-FHIR-Server-URL": "https://fhir.example.com/r4",
        "X-FHIR-Access-Token": "opaque-token",
      }),
    ).toEqual({
      patientId: "patient-abc",
      fhirServerUrl: "https://fhir.example.com/r4",
      fhirAccessToken: "opaque-token",
    });
  });

  it("reads canonical headers case-insensitively", () => {
    expect(
      extractSharpContextFromHeaders({
        "x-patient-id": "patient-lower",
        "x-fhir-server-url": "https://fhir.example.com/r4",
        "x-fhir-access-token": "opaque-token",
      }),
    ).toEqual({
      patientId: "patient-lower",
      fhirServerUrl: "https://fhir.example.com/r4",
      fhirAccessToken: "opaque-token",
    });
  });

  it("includes optional refresh fields when present", () => {
    expect(
      extractSharpContextFromHeaders({
        "x-patient-id": "patient-1",
        "x-fhir-server-url": "https://fhir.example.com/r4",
        "x-fhir-access-token": "opaque-token",
        "x-fhir-refresh-token": "refresh-1",
        "x-fhir-refresh-url": "https://auth.example.com/token",
      }),
    ).toEqual({
      patientId: "patient-1",
      fhirServerUrl: "https://fhir.example.com/r4",
      fhirAccessToken: "opaque-token",
      fhirRefreshToken: "refresh-1",
      fhirRefreshUrl: "https://auth.example.com/token",
    });
  });

  it("derives patient ID from a JWT `patient` claim when X-Patient-ID is absent", () => {
    const token = makeJwt({ patient: "patient-from-jwt", iss: "smart" });
    expect(
      extractSharpContextFromHeaders({
        "x-fhir-server-url": "https://fhir.example.com/r4",
        "x-fhir-access-token": token,
      }),
    ).toEqual({
      patientId: "patient-from-jwt",
      fhirServerUrl: "https://fhir.example.com/r4",
      fhirAccessToken: token,
    });
  });

  it("prefers JWT `patient` claim over an explicit X-Patient-ID header", () => {
    const token = makeJwt({ patient: "jwt-wins" });
    const ctx = extractSharpContextFromHeaders({
      "x-patient-id": "header-loses",
      "x-fhir-access-token": token,
    });
    expect(ctx?.patientId).toBe("jwt-wins");
  });

  it("ignores a malformed JWT and falls back to the explicit header", () => {
    expect(
      extractSharpContextFromHeaders({
        "x-patient-id": "patient-fallback",
        "x-fhir-access-token": "not-a-jwt",
      }),
    ).toEqual({
      patientId: "patient-fallback",
      fhirAccessToken: "not-a-jwt",
    });
  });

  it("returns null when neither a header patient ID nor a JWT-patient claim is available", () => {
    expect(
      extractSharpContextFromHeaders({
        "x-fhir-server-url": "https://fhir.example.com/r4",
        "x-fhir-access-token": makeJwt({ sub: "no-patient-claim" }),
      }),
    ).toBeNull();
  });

  it("is case-insensitive across mixed-case canonical names", () => {
    expect(SHARP_HEADERS.patientId).toBe("x-patient-id");
    expect(
      extractSharpContextFromHeaders({
        "X-PATIENT-ID": "patient-mixed",
      }),
    ).toEqual({ patientId: "patient-mixed" });
  });
});

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

describe("decodeJwtPayload / patientFromJwt", () => {
  it("returns null for non-JWT strings", () => {
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("opaque-token")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull();
  });

  it("decodes a base64url JWT payload", () => {
    const token = makeJwt({ patient: "pid", scope: "patient/Patient.rs" });
    expect(decodeJwtPayload(token)).toEqual({
      patient: "pid",
      scope: "patient/Patient.rs",
    });
  });

  it("strips a leading `Bearer ` prefix when decoding", () => {
    const token = makeJwt({ patient: "pid" });
    expect(patientFromJwt(`Bearer ${token}`)).toBe("pid");
  });

  it("returns null when no patient claim is present", () => {
    expect(patientFromJwt(makeJwt({ sub: "user-only" }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveSharpContext (combined precedence)
// ---------------------------------------------------------------------------

describe("resolveSharpContext", () => {
  it("prefers canonical HTTP headers over _meta", () => {
    expect(
      resolveSharpContext(
        { "x-patient-id": "header-id" },
        { patient_id: "meta-id" },
      )?.patientId,
    ).toBe("header-id");
  });

  it("falls back to _meta when canonical headers are absent", () => {
    expect(
      resolveSharpContext(undefined, { patient_id: "meta-id" })?.patientId,
    ).toBe("meta-id");
  });

  it("returns null when neither headers nor _meta carry context", () => {
    expect(resolveSharpContext(undefined, undefined)).toBeNull();
    expect(resolveSharpContext({}, {})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolvePatientId — integration with the request-scoped header store
// ---------------------------------------------------------------------------

describe("resolvePatientId", () => {
  it("prefers the explicit patient ID when both input and SHARP context exist", () => {
    expect(
      resolvePatientId("explicit-id", {
        patient_id: "sharp-id",
      }),
    ).toBe("explicit-id");
  });

  it("falls back to the SHARP _meta patient ID when explicit input is missing", () => {
    expect(
      resolvePatientId(undefined, {
        patient_id: "sharp-id",
      }),
    ).toBe("sharp-id");
  });

  it("returns undefined when neither source provides a patient ID", () => {
    expect(resolvePatientId(undefined, {})).toBeUndefined();
  });

  it("resolves the patient ID from canonical HTTP headers when in a request scope", () => {
    const result = runWithRequestHeaders(
      { "x-patient-id": "header-patient" },
      () => resolvePatientId(undefined, undefined),
    );
    expect(result).toBe("header-patient");
  });

  it("prefers canonical HTTP header patient ID over _meta when both are present", () => {
    const result = runWithRequestHeaders(
      { "x-patient-id": "header-patient" },
      () => resolvePatientId(undefined, { patient_id: "meta-patient" }),
    );
    expect(result).toBe("header-patient");
  });
});
