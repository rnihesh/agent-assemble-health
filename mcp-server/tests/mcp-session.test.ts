import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../src/server.js";

/**
 * Regression: when a client sends `initialize` and then `tools/list` using
 * the returned `mcp-session-id`, the server must accept the second request.
 *
 * The earlier implementation read `transport.sessionId` immediately after
 * `mcpServer.connect(transport)` — but the StreamableHTTPServerTransport
 * only allocates the session id while it actually handles the initialize
 * request, so the transport was never stored and every follow-up call
 * 400'd with "Invalid or expired session". This test wires up a minimal
 * version of the same Express + MCP plumbing as `src/index.ts` and walks
 * a real handshake.
 */

let server: Server;
let baseUrl: string;
const transports = new Map<string, StreamableHTTPServerTransport>();

beforeAll(async () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => transports.set(sid, transport),
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };
      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
    } else {
      res.status(400).json({ error: "Invalid or expired session" });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function postMcp(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ headers: Headers; text: string }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { headers: res.headers, text: await res.text() };
}

describe("MCP session lifecycle", () => {
  it("issues a session id on initialize and accepts tools/list with that id", async () => {
    const init = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "session-test", version: "0.1" },
      },
    });
    const sid = init.headers.get("mcp-session-id");
    expect(sid, "initialize must return a mcp-session-id header").toBeTruthy();
    expect(init.text).toContain("ai.promptopinion/fhir-context");

    const list = await postMcp(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { "mcp-session-id": sid! },
    );
    expect(list.text, "tools/list must succeed with the issued session id").not.toContain(
      "Invalid or expired session",
    );
    // All ten registered tools must appear by name.
    for (const name of [
      "patient_summary",
      "check_drug_interactions",
      "interpret_lab_results",
      "calculate_risk_score",
      "identify_care_gaps",
      "match_clinical_guidelines",
      "differential_diagnosis",
      "clinical_handoff",
      "draft_soap_note",
      "patient_friendly_summary",
    ]) {
      expect(list.text, `tools/list must include ${name}`).toContain(`"name":"${name}"`);
    }
  });

  it("returns 400 Invalid or expired session when an unknown session id is supplied", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: 99, method: "tools/list" },
      { "mcp-session-id": "00000000-0000-0000-0000-000000000000" },
    );
    expect(res.text).toContain("Invalid or expired session");
  });
});
