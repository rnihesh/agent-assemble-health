import "dotenv/config";

import { randomUUID } from "node:crypto";
import express from "express";
import pino from "pino";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { ENV } from "./config/env.js";

const logger = pino({
  level: ENV.LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: { colorize: true },
  },
});

const app = express();
app.use(express.json());

// ── Session management ─────────────────────────────────────────────────────
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

// ── MCP endpoint: POST /mcp ─────────────────────────────────────────────────
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.has(sessionId)) {
    // Re-use existing transport for this session
    transport = transports.get(sessionId)!;
  } else if (!sessionId) {
    // New session: create transport + server
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        transports.delete(sid);
        logger.info({ sessionId: sid }, "MCP session closed");
      }
    };

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
      logger.info({ sessionId: transport.sessionId }, "MCP session created");
    }
  } else {
    // sessionId provided but not found
    res.status(400).json({ error: "Invalid or expired session" });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// ── MCP endpoint: GET /mcp (SSE stream) ─────────────────────────────────────
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// ── MCP endpoint: DELETE /mcp ───────────────────────────────────────────────
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
    logger.info({ sessionId }, "MCP session deleted by client");
  } else {
    res.status(400).json({ error: "Invalid or missing session ID" });
  }
});

// ── Health check ────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    name: "medassist-mcp-server",
    version: "1.0.0",
    activeSessions: transports.size,
    fhirBaseUrl: ENV.FHIR_BASE_URL,
  });
});

// ── Start server ────────────────────────────────────────────────────────────
app.listen(ENV.PORT, () => {
  logger.info(
    {
      port: ENV.PORT,
      fhirBaseUrl: ENV.FHIR_BASE_URL,
    },
    `MedAssist MCP Server listening on port ${ENV.PORT}`,
  );
  logger.info("Endpoints:");
  logger.info(`  POST   http://localhost:${ENV.PORT}/mcp    - MCP messages`);
  logger.info(`  GET    http://localhost:${ENV.PORT}/mcp    - MCP SSE stream`);
  logger.info(`  DELETE http://localhost:${ENV.PORT}/mcp    - Close session`);
  logger.info(`  GET    http://localhost:${ENV.PORT}/health - Health check`);
});
