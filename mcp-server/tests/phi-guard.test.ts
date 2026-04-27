import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertSyntheticFhirUrl,
  PhiGuardViolation,
  allowedFhirHosts,
  phiGuardEnabled,
} from "../src/auth/phi-guard.js";

const TRACKED = ["ALLOWED_FHIR_HOSTS", "PHI_GUARD"];

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const before: Record<string, string | undefined> = {};
  for (const k of TRACKED) {
    before[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of TRACKED) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

describe("PHI guardrail", () => {
  beforeEach(() => {
    delete process.env.ALLOWED_FHIR_HOSTS;
    delete process.env.PHI_GUARD;
  });
  afterEach(() => {
    delete process.env.ALLOWED_FHIR_HOSTS;
    delete process.env.PHI_GUARD;
  });

  describe("default allowlist", () => {
    it("accepts the public HAPI sandbox", () => {
      expect(() => assertSyntheticFhirUrl("https://hapi.fhir.org/baseR4")).not.toThrow();
      expect(() => assertSyntheticFhirUrl("http://hapi.fhir.org/baseR4")).not.toThrow();
    });

    it("accepts localhost", () => {
      expect(() => assertSyntheticFhirUrl("http://localhost:8080/fhir")).not.toThrow();
      expect(() => assertSyntheticFhirUrl("http://127.0.0.1/fhir")).not.toThrow();
    });

    it("accepts the Prompt Opinion reference endpoints", () => {
      expect(() => assertSyntheticFhirUrl("https://dotnet.fhir-mcp.promptopinion.ai")).not.toThrow();
      expect(() => assertSyntheticFhirUrl("https://ts.fhir-mcp.promptopinion.ai")).not.toThrow();
    });

    it("rejects an unknown host with a PhiGuardViolation", () => {
      expect(() => assertSyntheticFhirUrl("https://acme-hospital.example/fhir")).toThrow(PhiGuardViolation);
    });

    it("rejects an unparseable URL", () => {
      expect(() => assertSyntheticFhirUrl("not-a-url")).toThrow(PhiGuardViolation);
    });
  });

  describe("ALLOWED_FHIR_HOSTS env override", () => {
    it("accepts hosts added via the env var", () => {
      withEnv({ ALLOWED_FHIR_HOSTS: "synthea.example,fhir.test" }, () => {
        expect(() => assertSyntheticFhirUrl("https://synthea.example/fhir")).not.toThrow();
        expect(() => assertSyntheticFhirUrl("https://fhir.test/baseR4")).not.toThrow();
      });
    });

    it("still rejects hosts not in the combined list", () => {
      withEnv({ ALLOWED_FHIR_HOSTS: "synthea.example" }, () => {
        expect(() => assertSyntheticFhirUrl("https://acme-hospital.example/fhir")).toThrow(PhiGuardViolation);
      });
    });

    it("trims whitespace and lowercases entries", () => {
      withEnv({ ALLOWED_FHIR_HOSTS: " Synthea.Example , Fhir.Test " }, () => {
        const hosts = allowedFhirHosts();
        expect(hosts).toContain("synthea.example");
        expect(hosts).toContain("fhir.test");
      });
    });
  });

  describe("PHI_GUARD opt-out", () => {
    it("disables the check when PHI_GUARD=off", () => {
      withEnv({ PHI_GUARD: "off" }, () => {
        expect(phiGuardEnabled()).toBe(false);
        expect(() => assertSyntheticFhirUrl("https://acme-hospital.example/fhir")).not.toThrow();
      });
    });

    it("treats PHI_GUARD=false and PHI_GUARD=0 the same as off", () => {
      withEnv({ PHI_GUARD: "false" }, () => expect(phiGuardEnabled()).toBe(false));
      withEnv({ PHI_GUARD: "0" }, () => expect(phiGuardEnabled()).toBe(false));
    });

    it("is enabled by default", () => {
      expect(phiGuardEnabled()).toBe(true);
    });
  });

  it("error message names the host and points at the allowlist env var", () => {
    try {
      assertSyntheticFhirUrl("https://acme-hospital.example/fhir");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PhiGuardViolation);
      const msg = (err as Error).message;
      expect(msg).toContain("acme-hospital.example");
      expect(msg).toContain("ALLOWED_FHIR_HOSTS");
      expect(msg).toContain("PHI_GUARD=off");
    }
  });
});
