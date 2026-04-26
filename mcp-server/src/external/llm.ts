import OpenAI from "openai";

export type LLMProvider = "nowbind" | "openai";

export interface LLMClientConfig {
  client: OpenAI;
  model: string;
  provider: LLMProvider;
}

/**
 * Build an OpenAI-compatible LLM client from process.env. Returns null when
 * neither provider is configured. Callers must handle null and surface a clear
 * error to the user — this function intentionally does not throw on missing
 * config, because that path is part of the tool's normal not-configured
 * response.
 *
 * Reads `process.env` directly (rather than the cached ENV constant) so tests
 * can mutate the environment between calls without re-importing modules.
 *
 * Precedence: NOWBIND > direct OpenAI. The user has more credits on NOWBIND
 * (Azure-proxy) so it's the default when both are present.
 */
export function buildLLMClient(): LLMClientConfig | null {
  const nowbindKey = nonEmpty(process.env.NOWBIND_AGENT_OPENAI_API_KEY);
  const nowbindBase = nonEmpty(process.env.NOWBIND_AGENT_OPENAI_BASE_URL);
  const nowbindModel =
    nonEmpty(process.env.NOWBIND_AGENT_OPENAI_MODEL) ?? "gpt-4o";

  if (nowbindKey && nowbindBase) {
    return {
      client: new OpenAI({ apiKey: nowbindKey, baseURL: nowbindBase }),
      model: nowbindModel,
      provider: "nowbind",
    };
  }

  const openaiKey = nonEmpty(process.env.OPENAI_API_KEY);
  const openaiModel =
    nonEmpty(process.env.OPENAI_DEFAULT_MODEL) ?? "gpt-4o-mini";

  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: openaiModel,
      provider: "openai",
    };
  }

  return null;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Human-readable explanation of how to configure the LLM. Used when a tool
 * needs to render an error inline instead of throwing.
 */
export const LLM_NOT_CONFIGURED_MESSAGE =
  "No LLM provider configured. Set either `NOWBIND_AGENT_OPENAI_API_KEY` + `NOWBIND_AGENT_OPENAI_BASE_URL` (preferred) or `OPENAI_API_KEY` in the MCP server's environment.";
