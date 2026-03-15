import { describe, expect, it } from "vitest";
import { extractSharpContext } from "../src/auth/sharp-context.js";
import { resolvePatientId } from "../src/server.js";

describe("extractSharpContext", () => {
  it("returns null for non-object metadata", () => {
    expect(extractSharpContext(null)).toBeNull();
    expect(extractSharpContext("bad-meta")).toBeNull();
  });

  it("extracts patient and FHIR connection details from SHARP metadata", () => {
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

describe("resolvePatientId", () => {
  it("prefers the explicit patient ID when both input and SHARP context exist", () => {
    expect(
      resolvePatientId("explicit-id", {
        patient_id: "sharp-id",
      }),
    ).toBe("explicit-id");
  });

  it("falls back to the SHARP patient ID when explicit input is missing", () => {
    expect(
      resolvePatientId(undefined, {
        patient_id: "sharp-id",
      }),
    ).toBe("sharp-id");
  });

  it("returns undefined when neither source provides a patient ID", () => {
    expect(resolvePatientId(undefined, {})).toBeUndefined();
  });
});
