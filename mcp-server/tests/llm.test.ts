import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We re-import the module after mutating env so ENV picks up changes.
const TRACKED_ENV = [
  'NOWBIND_AGENT_OPENAI_API_KEY',
  'NOWBIND_AGENT_OPENAI_BASE_URL',
  'NOWBIND_AGENT_OPENAI_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_DEFAULT_MODEL',
];

async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const before: Record<string, string | undefined> = {};
  for (const k of TRACKED_ENV) {
    before[k] = process.env[k];
    // Default each tracked key to empty string (treated as "missing" by the
    // factory), then apply any explicit override.
    process.env[k] = '';
  }
  for (const k of Object.keys(vars)) {
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    await fn();
  } finally {
    for (const k of TRACKED_ENV) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

describe('buildLLMClient', () => {
  beforeEach(() => {
    delete process.env.NOWBIND_AGENT_OPENAI_API_KEY;
    delete process.env.NOWBIND_AGENT_OPENAI_BASE_URL;
    delete process.env.NOWBIND_AGENT_OPENAI_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_DEFAULT_MODEL;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns a NOWBIND client when NOWBIND env is set', async () => {
    await withEnv(
      {
        NOWBIND_AGENT_OPENAI_API_KEY: 'nb-key-123',
        NOWBIND_AGENT_OPENAI_BASE_URL: 'https://example.azure.openai/v1/',
        NOWBIND_AGENT_OPENAI_MODEL: 'gpt-4o',
      },
      async () => {
        const { buildLLMClient } = await import('../src/external/llm.js');
        // _ to silence "unused" if any path strips it
        const cfg = buildLLMClient();
        expect(cfg).not.toBeNull();
        expect(cfg!.provider).toBe('nowbind');
        expect(cfg!.model).toBe('gpt-4o');
      },
    );
  });

  it('falls back to OpenAI when NOWBIND is not set', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'sk-test-1',
        OPENAI_DEFAULT_MODEL: 'gpt-4o-mini',
      },
      async () => {
        const { buildLLMClient } = await import('../src/external/llm.js');
        // _ to silence "unused" if any path strips it
        const cfg = buildLLMClient();
        expect(cfg).not.toBeNull();
        expect(cfg!.provider).toBe('openai');
        expect(cfg!.model).toBe('gpt-4o-mini');
      },
    );
  });

  it('NOWBIND takes precedence when both are set', async () => {
    await withEnv(
      {
        NOWBIND_AGENT_OPENAI_API_KEY: 'nb-key',
        NOWBIND_AGENT_OPENAI_BASE_URL: 'https://example.azure.openai/v1/',
        OPENAI_API_KEY: 'sk-test-2',
      },
      async () => {
        const { buildLLMClient } = await import('../src/external/llm.js');
        // _ to silence "unused" if any path strips it
        const cfg = buildLLMClient();
        expect(cfg!.provider).toBe('nowbind');
      },
    );
  });

  it('returns null when neither provider is configured', async () => {
    await withEnv({}, async () => {
      const { buildLLMClient } = await import('../src/external/llm.js');
      expect(buildLLMClient()).toBeNull();
    });
  });

  it('NOWBIND requires both key and base URL', async () => {
    await withEnv(
      {
        NOWBIND_AGENT_OPENAI_API_KEY: 'nb-only-key',
        OPENAI_API_KEY: 'sk-fallback',
      },
      async () => {
        const { buildLLMClient } = await import('../src/external/llm.js');
        // _ to silence "unused" if any path strips it
        // Without base URL, fall back to OpenAI.
        expect(buildLLMClient()!.provider).toBe('openai');
      },
    );
  });
});
