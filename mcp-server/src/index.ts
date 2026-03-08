import "dotenv/config";

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import cors from "cors";
import pino from "pino";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { ENV } from "./config/env.js";
import { FHIRClient } from "./fhir/client.js";
import { patientSummary } from "./tools/patient-summary.js";
import { checkDrugInteractions } from "./tools/drug-interaction.js";
import { interpretLabResults } from "./tools/lab-interpreter.js";
import { calculateRiskScore } from "./tools/risk-calculator.js";
import { identifyCareGaps } from "./tools/care-gap-identifier.js";
import { matchClinicalGuidelines } from "./tools/guideline-matcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({
  level: ENV.LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: { colorize: true },
  },
});

const app = express();
app.use(cors());
app.use(express.json());

// ── Static frontend ────────────────────────────────────────────────────────
app.use("/app", express.static(path.join(__dirname, "../../frontend")));

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

// ── REST API endpoints (for frontend dashboard) ────────────────────────────

function buildApiClient(): FHIRClient {
  return new FHIRClient(ENV.FHIR_BASE_URL, ENV.FHIR_ACCESS_TOKEN);
}

app.post("/api/patient-summary", async (req, res) => {
  try {
    const { patientId, sections } = req.body;
    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }
    const client = buildApiClient();
    const result = await patientSummary(client, { patientId, sections });
    res.json({ result });
  } catch (err) {
    logger.error(err, "patient-summary API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/drug-interactions", async (req, res) => {
  try {
    const { patientId, medications } = req.body;
    if (!patientId && (!medications || medications.length === 0)) {
      res.status(400).json({ error: "Provide patientId, medications, or both" });
      return;
    }
    const client = patientId ? buildApiClient() : null;
    const result = await checkDrugInteractions(client, { patientId, medications });
    res.json({ result });
  } catch (err) {
    logger.error(err, "drug-interactions API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/lab-results", async (req, res) => {
  try {
    const { patientId, lookbackDays } = req.body;
    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }
    const client = buildApiClient();
    const result = await interpretLabResults(client, { patientId, lookbackDays });
    res.json({ result });
  } catch (err) {
    logger.error(err, "lab-results API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/risk-score", async (req, res) => {
  try {
    const { patientId, calculator } = req.body;
    if (!patientId || !calculator) {
      res.status(400).json({ error: "patientId and calculator are required" });
      return;
    }
    const client = buildApiClient();
    const result = await calculateRiskScore(client, { patientId, calculator });
    res.json({ result });
  } catch (err) {
    logger.error(err, "risk-score API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/care-gaps", async (req, res) => {
  try {
    const { patientId } = req.body;
    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }
    const client = buildApiClient();
    const result = await identifyCareGaps(client, { patientId });
    res.json({ result });
  } catch (err) {
    logger.error(err, "care-gaps API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/clinical-guidelines", async (req, res) => {
  try {
    const { patientId, condition } = req.body;
    if (!patientId && !condition) {
      res.status(400).json({ error: "Provide patientId, condition, or both" });
      return;
    }
    const client = patientId ? buildApiClient() : null;
    const result = await matchClinicalGuidelines(client, { patientId, condition });
    res.json({ result });
  } catch (err) {
    logger.error(err, "clinical-guidelines API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
  logger.info(`  GET    http://localhost:${ENV.PORT}/app    - Clinical dashboard`);
  logger.info("REST API:");
  logger.info(`  POST   /api/patient-summary`);
  logger.info(`  POST   /api/drug-interactions`);
  logger.info(`  POST   /api/lab-results`);
  logger.info(`  POST   /api/risk-score`);
  logger.info(`  POST   /api/care-gaps`);
  logger.info(`  POST   /api/clinical-guidelines`);
});
