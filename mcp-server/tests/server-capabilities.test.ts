import { describe, expect, it } from "vitest";
import {
  createMcpServer,
  FHIR_CONTEXT_EXTENSION,
  FHIR_CONTEXT_EXTENSION_URI,
} from "../src/server.js";

/**
 * The MCP `Server` constructed by `McpServer` exposes its declared
 * capabilities via the private `_capabilities` field, which the SDK uses to
 * answer `initialize` requests. We assert against that object directly so
 * the test does not depend on running a transport.
 */
function getDeclaredCapabilities(mcpServer: ReturnType<typeof createMcpServer>): Record<string, unknown> {
  // The McpServer wrapper exposes the underlying `Server` via `.server`;
  // dig into its capabilities. The structure is part of the SDK's
  // initialize-response payload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = (mcpServer as unknown as { server: any }).server;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caps = (inner as any).getCapabilities();
  return caps as Record<string, unknown>;
}

describe("MCP server FHIR-context capability declaration", () => {
  it("declares the ai.promptopinion/fhir-context extension", () => {
    const server = createMcpServer();
    const caps = getDeclaredCapabilities(server);
    const extensions = caps.extensions as Record<string, unknown> | undefined;
    expect(extensions).toBeDefined();
    expect(extensions).toHaveProperty(FHIR_CONTEXT_EXTENSION_URI);
  });

  it("uses the canonical extension URI 'ai.promptopinion/fhir-context'", () => {
    expect(FHIR_CONTEXT_EXTENSION_URI).toBe("ai.promptopinion/fhir-context");
  });

  it("marks patient/Patient.rs as required and lists the six MedAssist scopes plus offline_access", () => {
    const scopes = FHIR_CONTEXT_EXTENSION.scopes;
    const names = scopes.map((s) => s.name);
    expect(names).toEqual([
      "patient/Patient.rs",
      "patient/Observation.rs",
      "patient/Condition.rs",
      "patient/MedicationStatement.rs",
      "patient/AllergyIntolerance.rs",
      "patient/Immunization.rs",
      "offline_access",
    ]);

    const required = scopes.filter((s) => "required" in s && s.required === true);
    expect(required).toHaveLength(1);
    expect(required[0].name).toBe("patient/Patient.rs");
  });

  it("declares fhir_context_required.value = false so unauthenticated initialize still succeeds", () => {
    expect(FHIR_CONTEXT_EXTENSION.fhir_context_required).toEqual({ value: false });
  });

  it("merges the extension declaration alongside tool registrations on the live server", () => {
    const server = createMcpServer();
    const caps = getDeclaredCapabilities(server);
    // After all 6 tools are registered, capabilities.tools should be present
    // and the extension declaration should still be intact (mergeCapabilities
    // is non-destructive to unknown top-level keys).
    expect(caps).toHaveProperty("tools");
    expect(caps).toHaveProperty("extensions");

    const ext = (caps.extensions as Record<string, unknown>)[
      FHIR_CONTEXT_EXTENSION_URI
    ] as Record<string, unknown>;
    expect(ext).toBeDefined();
    expect(ext.scopes).toBeDefined();
    expect(Array.isArray(ext.scopes)).toBe(true);
    expect((ext.scopes as Array<unknown>).length).toBe(7);
    expect(ext.fhir_context_required).toEqual({ value: false });
  });
});
