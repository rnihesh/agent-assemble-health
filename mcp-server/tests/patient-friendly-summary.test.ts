import { describe, it, expect, vi } from 'vitest';
import { patientFriendlySummary } from '../src/tools/patient-friendly-summary.js';
import {
  mockFHIRClient,
  mockPatient,
  mockCondition,
} from './helpers/mock-fhir.js';
import type { LLMClientConfig } from '../src/external/llm.js';

function buildMockLLM(content: string): LLMClientConfig {
  return {
    provider: 'nowbind',
    model: 'mock-gpt-4o',
    client: {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content } }],
          })),
        },
      },
    } as never,
  };
}

const MOCK_BODY = `## Your conditions
- High blood pressure (since 1991). This means your heart works harder than it should.
- Type 2 diabetes (since 1991). Your body has trouble using sugar from food.

## Your medications
- Simvastatin 10mg, once a day — helps lower cholesterol.

## What this means for you
Your record shows long-standing conditions that need regular check-ins. Talk to your clinician about your goals.`;

describe('patientFriendlySummary', () => {
  const fhir = mockFHIRClient({
    Patient: mockPatient(),
    Condition: [mockCondition('Type 2 Diabetes', { id: 'cond-dm2' })],
    MedicationRequest: [],
    AllergyIntolerance: [],
    Observation: [],
    Immunization: [],
  });

  it('renders the LLM body with audience metadata', async () => {
    const out = await patientFriendlySummary(
      fhir,
      { patientId: 'test-patient-1' },
      { llmConfig: buildMockLLM(MOCK_BODY) },
    );
    expect(out).toContain('# Your Health Summary');
    expect(out).toContain('Language: English');
    expect(out).toContain('Reading level: 6th grade');
    expect(out).toContain('High blood pressure');
    expect(out).toContain('not medical advice');
  });

  it('honors language and reading level overrides', async () => {
    const llm = buildMockLLM(MOCK_BODY);
    const out = await patientFriendlySummary(
      fhir,
      { patientId: 'test-patient-1', language: 'Spanish', readingLevel: '4th grade' },
      { llmConfig: llm },
    );
    expect(out).toContain('Language: Spanish');
    expect(out).toContain('Reading level: 4th grade');
    const create = llm.client.chat.completions.create as unknown as ReturnType<typeof vi.fn>;
    const args = create.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    const userMsg = args.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Language: Spanish');
    expect(userMsg?.content).toContain('Reading level: 4th grade');
  });

  it('returns the not-configured message when LLM is null', async () => {
    const out = await patientFriendlySummary(
      fhir,
      { patientId: 'test-patient-1' },
      { llmConfig: null },
    );
    expect(out).toContain('LLM provider not configured');
  });

  it('handles empty LLM responses gracefully', async () => {
    const out = await patientFriendlySummary(
      fhir,
      { patientId: 'test-patient-1' },
      { llmConfig: buildMockLLM('   ') },
    );
    expect(out).toContain('empty response');
  });

  it('does not crash when patient summary fetch fails', async () => {
    const failingClient = {
      read: vi.fn(async () => { throw new Error('FHIR 500'); }),
      search: vi.fn(),
      searchEntries: vi.fn(),
      searchAll: vi.fn(),
    } as never;
    const out = await patientFriendlySummary(
      failingClient,
      { patientId: 'test-patient-1' },
      { llmConfig: buildMockLLM(MOCK_BODY) },
    );
    expect(out).toContain('grounding context');
  });
});
