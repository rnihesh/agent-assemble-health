import { describe, it, expect, vi } from 'vitest';
import { nextBestTest } from '../src/tools/next-best-test.js';
import {
  mockFHIRClient,
  mockPatient,
  mockCondition,
} from './helpers/mock-fhir.js';
import type { LLMClientConfig } from '../src/external/llm.js';

function buildMockLLM(jsonContent: string): LLMClientConfig {
  return {
    provider: 'nowbind',
    model: 'mock-gpt-4o',
    client: {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: jsonContent } }],
          })),
        },
      },
    } as never,
  };
}

const MOCK = JSON.stringify({
  topTest: {
    test: 'BNP / NT-proBNP',
    rationale:
      'Quickly distinguishes cardiac from non-cardiac causes of dyspnea/edema. Given the presentation and HTN/metabolic syndrome history, BNP elevates likelihood of CHF substantially.',
    expectedDiscrimination: 'High',
    ifPositive: 'Pursue echocardiography and CHF-targeted workup.',
    ifNegative: 'CHF is unlikely; pivot to renal/hepatic/thyroid workup.',
    costContext: 'Standard lab, point-of-care available, low cost.',
  },
  alternativeTests: [
    {
      test: 'Echocardiogram',
      rationale: 'Gold standard for systolic vs diastolic dysfunction.',
      expectedDiscrimination: 'High',
      ifPositive: 'Define HF phenotype and start GDMT.',
      ifNegative: 'Look for non-cardiac causes.',
    },
    {
      test: 'TSH',
      rationale: 'Cheap rule-out for hypothyroidism contributing to fatigue.',
      expectedDiscrimination: 'Low',
      ifPositive: 'Treat hypothyroidism and re-evaluate.',
      ifNegative: 'Drop hypothyroidism from differential.',
    },
  ],
});

describe('nextBestTest', () => {
  const fhir = mockFHIRClient({
    Patient: mockPatient(),
    Condition: [mockCondition('Hypertension', { id: 'cond-htn' })],
    MedicationRequest: [],
    AllergyIntolerance: [],
    Observation: [],
    Immunization: [],
  });

  it('renders top test + alternatives from a valid LLM response', async () => {
    const out = await nextBestTest(
      fhir,
      { patientId: 'test-patient-1', chiefComplaint: '72F fatigue and edema' },
      { llmConfig: buildMockLLM(MOCK) },
    );
    expect(out).toContain('# Next Best Test');
    expect(out).toContain('## Recommended: BNP / NT-proBNP');
    expect(out).toContain('Discrimination:** High');
    expect(out).toContain('Echocardiogram');
    expect(out).toContain('TSH');
    expect(out).toContain('Decision support only');
  });

  it('passes candidate differential into the LLM prompt', async () => {
    const llm = buildMockLLM(MOCK);
    await nextBestTest(
      fhir,
      {
        patientId: 'test-patient-1',
        chiefComplaint: 'fatigue',
        candidates: ['CHF', 'CKD progression', 'hypothyroidism'],
      },
      { llmConfig: llm },
    );
    const create = llm.client.chat.completions.create as unknown as ReturnType<typeof vi.fn>;
    const args = create.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    const userMsg = args.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Working Differential');
    expect(userMsg?.content).toContain('CKD progression');
  });

  it('errors cleanly when chief complaint missing', async () => {
    const out = await nextBestTest(
      fhir,
      { patientId: 'test-patient-1', chiefComplaint: '   ' },
      { llmConfig: buildMockLLM(MOCK) },
    );
    expect(out).toContain('Chief complaint is required');
  });

  it('errors cleanly when LLM unconfigured', async () => {
    const out = await nextBestTest(
      fhir,
      { patientId: 'test-patient-1', chiefComplaint: 'fatigue' },
      { llmConfig: null },
    );
    expect(out).toContain('LLM provider not configured');
  });

  it('errors cleanly on malformed JSON', async () => {
    const out = await nextBestTest(
      fhir,
      { patientId: 'test-patient-1', chiefComplaint: 'fatigue' },
      { llmConfig: buildMockLLM('not json') },
    );
    expect(out).toContain('malformed JSON');
  });

  it('errors cleanly when LLM omits topTest', async () => {
    const partial = JSON.stringify({ alternativeTests: [] });
    const out = await nextBestTest(
      fhir,
      { patientId: 'test-patient-1', chiefComplaint: 'fatigue' },
      { llmConfig: buildMockLLM(partial) },
    );
    expect(out).toContain('did not nominate a top test');
  });
});
