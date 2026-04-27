/**
 * PHI guardrail.
 *
 * Hackathon rules: any real PHI is automatic disqualification. The guardrail
 * refuses to construct a FHIRClient when `FHIR_BASE_URL` resolves to a host
 * outside the allowlist of synthetic / sandbox / local hosts.
 *
 * Default allowlist: HAPI's public sandbox + localhost + the Prompt Opinion
 * reference test endpoints. Operators can extend via env:
 *
 *   ALLOWED_FHIR_HOSTS=comma,separated,list,of,hostnames
 *
 * The check is opt-out (`PHI_GUARD=off`) but explicitly NOT opt-out by
 * default, so a stray production URL in `.env` raises a loud error rather
 * than silently sending a request.
 */

export class PhiGuardViolation extends Error {
  constructor(public readonly host: string, public readonly url: string) {
    super(
      `Refusing to call FHIR server "${url}" — host "${host}" is not on the synthetic-data allowlist. ` +
        `The Agents Assemble rules require synthetic data only. Set ALLOWED_FHIR_HOSTS to include this host ` +
        `if you have verified it serves synthetic data only, or set PHI_GUARD=off to disable the check entirely.`,
    );
    this.name = "PhiGuardViolation";
  }
}

const DEFAULT_ALLOWED_HOSTS: readonly string[] = [
  "hapi.fhir.org",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  // Public Prompt Opinion reference test endpoints
  "dotnet.fhir-mcp.promptopinion.ai",
  "ts.fhir-mcp.promptopinion.ai",
  // Common Synthea-bundle servers
  "syntheticmass.mitre.org",
];

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Read the configured allowlist. Reads `process.env` directly so tests can
 * mutate without re-importing.
 */
export function allowedFhirHosts(): readonly string[] {
  const extra = nonEmpty(process.env.ALLOWED_FHIR_HOSTS);
  if (!extra) return DEFAULT_ALLOWED_HOSTS;
  const additional = extra
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  return [...DEFAULT_ALLOWED_HOSTS, ...additional];
}

/**
 * Whether the guard is enabled. Defaults to `on` — must be explicitly
 * disabled via `PHI_GUARD=off`.
 */
export function phiGuardEnabled(): boolean {
  const flag = (process.env.PHI_GUARD ?? "on").toLowerCase();
  return flag !== "off" && flag !== "false" && flag !== "0";
}

/**
 * Verify that a FHIR URL points at a host on the synthetic-data allowlist.
 * Throws `PhiGuardViolation` if not. No-op when the guard is disabled.
 */
export function assertSyntheticFhirUrl(url: string): void {
  if (!phiGuardEnabled()) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PhiGuardViolation("(unparseable)", url);
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedFhirHosts();
  if (!allowed.includes(host)) {
    throw new PhiGuardViolation(host, url);
  }
}
