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
import { assertSyntheticFhirUrl } from "./auth/phi-guard.js";
import { runWithRequestHeaders } from "./auth/request-headers.js";
import { FHIRClient } from "./fhir/client.js";
import { patientSummary } from "./tools/patient-summary.js";
import { checkDrugInteractions } from "./tools/drug-interaction.js";
import { interpretLabResults } from "./tools/lab-interpreter.js";
import { calculateRiskScore } from "./tools/risk-calculator.js";
import { identifyCareGaps } from "./tools/care-gap-identifier.js";
import { matchClinicalGuidelines } from "./tools/guideline-matcher.js";
import { differentialDiagnosis } from "./tools/differential-diagnosis.js";
import { clinicalHandoff } from "./tools/clinical-handoff.js";
import { draftSoapNote } from "./tools/soap-note.js";
import { patientFriendlySummary } from "./tools/patient-friendly-summary.js";

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
app.get("/", (_req, res) => {
  res.redirect("/app");
});

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
    // New session: create transport + server. The sessionId is allocated
    // inside handleRequest when the inbound payload is `initialize`, so we
    // register the transport via the SDK's onsessioninitialized callback —
    // checking transport.sessionId before handleRequest runs always reads
    // undefined, which silently dropped subsequent requests.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
        logger.info({ sessionId: sid }, "MCP session created");
      },
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
  } else {
    // sessionId provided but not found
    res.status(400).json({ error: "Invalid or expired session" });
    return;
  }

  await runWithRequestHeaders(req.headers, () =>
    transport.handleRequest(req, res, req.body),
  );
});

// ── MCP endpoint: GET /mcp (SSE stream) ─────────────────────────────────────
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await runWithRequestHeaders(req.headers, () => transport.handleRequest(req, res));
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
  // PHI guardrail — refuses to call a host that isn't on the synthetic-data
  // allowlist. See src/auth/phi-guard.ts for the policy.
  assertSyntheticFhirUrl(ENV.FHIR_BASE_URL);
  return new FHIRClient(ENV.FHIR_BASE_URL, ENV.FHIR_ACCESS_TOKEN);
}

function buildAgentHealthUrl(): string {
  return `${ENV.AGENT_PUBLIC_URL.replace(/\/+$/, "")}/health`;
}

async function checkFhirHealth(): Promise<Record<string, unknown>> {
  const metadataUrl = `${ENV.FHIR_BASE_URL.replace(/\/+$/, "")}/metadata`;
  const headers: Record<string, string> = {
    Accept: "application/fhir+json",
  };

  if (ENV.FHIR_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${ENV.FHIR_ACCESS_TOKEN}`;
  }

  try {
    const response = await fetch(metadataUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return {
        status: "unhealthy",
        statusCode: response.status,
        metadataUrl,
      };
    }

    const body = await response.json().catch(() => ({}));
    return {
      status: "ok",
      metadataUrl,
      fhirVersion:
        typeof body?.fhirVersion === "string" ? body.fhirVersion : undefined,
      software:
        typeof body?.software?.name === "string" ? body.software.name : undefined,
    };
  } catch (error) {
    return {
      status: "unreachable",
      metadataUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkAgentHealth(): Promise<Record<string, unknown>> {
  const healthUrl = buildAgentHealthUrl();

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: "unhealthy",
        healthUrl,
        statusCode: response.status,
        details: body,
      };
    }

    return {
      status: "ok",
      healthUrl,
      details: body,
    };
  } catch (error) {
    return {
      status: "unreachable",
      healthUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

app.post("/api/soap-note", async (req, res) => {
  try {
    const { patientId, visitReason, clinicianNotes, language } = req.body;
    if (!patientId) {
      res.status(400).json({ error: "Provide patientId" });
      return;
    }
    if (!visitReason || typeof visitReason !== "string" || visitReason.trim().length === 0) {
      res.status(400).json({ error: "Provide visitReason as a non-empty string" });
      return;
    }
    const client = buildApiClient();
    const result = await draftSoapNote(client, {
      patientId,
      visitReason,
      clinicianNotes,
      language,
    });
    res.json({ result });
  } catch (err) {
    logger.error(err, "soap-note API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/patient-friendly-summary", async (req, res) => {
  try {
    const { patientId, language, readingLevel } = req.body;
    if (!patientId) {
      res.status(400).json({ error: "Provide patientId" });
      return;
    }
    const client = buildApiClient();
    const result = await patientFriendlySummary(client, {
      patientId,
      language,
      readingLevel,
    });
    res.json({ result });
  } catch (err) {
    logger.error(err, "patient-friendly-summary API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/clinical-handoff", async (req, res) => {
  try {
    const { patientId, lookbackDays, includeRiskScores } = req.body;
    if (!patientId) {
      res.status(400).json({ error: "Provide patientId" });
      return;
    }
    const client = buildApiClient();
    const result = await clinicalHandoff(client, {
      patientId,
      lookbackDays,
      includeRiskScores,
    });
    res.json({ result });
  } catch (err) {
    logger.error(err, "clinical-handoff API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/differential-diagnosis", async (req, res) => {
  try {
    const { patientId, chiefComplaint, additionalContext } = req.body;
    if (!patientId) {
      res.status(400).json({ error: "Provide patientId" });
      return;
    }
    if (!chiefComplaint || typeof chiefComplaint !== "string" || chiefComplaint.trim().length === 0) {
      res.status(400).json({ error: "Provide chiefComplaint as a non-empty string" });
      return;
    }
    const client = buildApiClient();
    const result = await differentialDiagnosis(client, {
      patientId,
      chiefComplaint,
      additionalContext,
    });
    res.json({ result });
  } catch (err) {
    logger.error(err, "differential-diagnosis API error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/system-status", async (_req, res) => {
  const [fhir, agent] = await Promise.all([
    checkFhirHealth(),
    checkAgentHealth(),
  ]);

  const overallStatus =
    fhir.status === "ok" && agent.status === "ok" ? "ok" : "degraded";

  res.status(overallStatus === "ok" ? 200 : 503).json({
    status: overallStatus,
    checkedAt: new Date().toISOString(),
    services: {
      mcp: {
        status: "ok",
        activeSessions: transports.size,
        port: ENV.PORT,
      },
      fhir,
      agent,
    },
  });
});

// ── Health check ────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  const deep =
    req.query.deep === "1" ||
    req.query.deep === "true" ||
    req.query.fhir === "1" ||
    req.query.fhir === "true";

  const payload: Record<string, unknown> = {
    status: "ok",
    name: "medassist-mcp-server",
    version: "1.0.0",
    activeSessions: transports.size,
    fhirBaseUrl: ENV.FHIR_BASE_URL,
  };

  if (deep) {
    const fhir = await checkFhirHealth();
    payload.fhir = fhir;
    if (fhir.status !== "ok") {
      payload.status = "degraded";
      res.status(503).json(payload);
      return;
    }
  }

  res.json(payload);
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
  logger.info(`  GET    /api/system-status`);
  logger.info(`  POST   /api/patient-summary`);
  logger.info(`  POST   /api/drug-interactions`);
  logger.info(`  POST   /api/lab-results`);
  logger.info(`  POST   /api/risk-score`);
  logger.info(`  POST   /api/care-gaps`);
  logger.info(`  POST   /api/clinical-guidelines`);
  logger.info(`  POST   /api/differential-diagnosis`);
  logger.info(`  POST   /api/clinical-handoff`);
  logger.info(`  POST   /api/soap-note`);
  logger.info(`  POST   /api/patient-friendly-summary`);
});
