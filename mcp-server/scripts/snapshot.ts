/**
 * Snapshot the live MCP tool outputs for the three demo patients into
 * `frontend/demo-fixtures/`. The dashboard falls back to these snapshots
 * when the live call fails, so a demo recording can still tell the story
 * even if HAPI is rate-limited or down.
 *
 * Run with the MCP server already up. From repo root:
 *   npm run snapshot --prefix mcp-server
 *
 * The script hits the REST endpoints (not the MCP transport) so the
 * captured shape exactly matches what the dashboard sees.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const fixturesDir = path.join(repoRoot, "frontend", "demo-fixtures");

const MCP = process.env.SNAPSHOT_MCP_URL ?? "http://127.0.0.1:3001";

interface Case {
  tool: string;
  endpoint: string;
  body: Record<string, unknown>;
}

const PATIENTS: { id: string; nick: string }[] = [
  { id: "6c4769e4-beda-5b20-3ba5-67e01c6daf03", nick: "considine" },
  { id: "99dd324a-1a4e-f640-ab63-729bfd413be4", nick: "pacocha" },
  { id: "3236e622-25fc-dfc3-70a3-f501faa674eb", nick: "padberg" },
];

function casesFor(patientId: string): Case[] {
  return [
    { tool: "patient-summary", endpoint: "/api/patient-summary", body: { patientId } },
    { tool: "drug-interactions", endpoint: "/api/drug-interactions", body: { patientId } },
    { tool: "lab-results", endpoint: "/api/lab-results", body: { patientId } },
    { tool: "risk-score", endpoint: "/api/risk-score", body: { patientId, calculator: "CHA2DS2-VASc" } },
    { tool: "care-gaps", endpoint: "/api/care-gaps", body: { patientId } },
    { tool: "clinical-handoff", endpoint: "/api/clinical-handoff", body: { patientId } },
    // Note: differential_diagnosis, soap_note, patient_friendly_summary
    // depend on a live LLM. We snapshot without them; the dashboard
    // falls back gracefully when an LLM tool fails (it's a different
    // failure-mode from FHIR being down).
  ];
}

async function snapshotCase(patientNick: string, c: Case): Promise<void> {
  const url = MCP + c.endpoint;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(c.body),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn(`  [skip] ${c.tool} ${patientNick}: HTTP ${res.status}`);
    return;
  }
  const filename = `${c.tool}__${patientNick}.json`;
  const filepath = path.join(fixturesDir, filename);
  await writeFile(
    filepath,
    JSON.stringify(
      {
        ...body,
        _snapshot: {
          tool: c.tool,
          patientId: (c.body as { patientId?: string }).patientId,
          patientNick,
          capturedAt: new Date().toISOString(),
          mcpVersion: "snapshot",
        },
      },
      null,
      2,
    ),
  );
  console.log(`  ok ${c.tool} ${patientNick}  (${(JSON.stringify(body).length / 1024).toFixed(1)} KB)`);
}

async function main(): Promise<void> {
  console.log("Snapshotting live MCP outputs to", fixturesDir);
  await mkdir(fixturesDir, { recursive: true });

  for (const p of PATIENTS) {
    console.log(`\nPatient ${p.nick} (${p.id})`);
    for (const c of casesFor(p.id)) {
      try {
        await snapshotCase(p.nick, c);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  [error] ${c.tool} ${p.nick}: ${msg}`);
      }
    }
  }

  console.log("\nDone.");
}

await main();
