import { describe, it, expect, vi } from 'vitest';
import { draftSoapNote } from '../src/tools/soap-note.js';
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

const MOCK_SOAP = JSON.stringify({
  subjective:
    'Patient presents for 3-month diabetes follow-up. Reports general fatigue, denies polyuria or vision changes. Adherent to metformin.',
  objective:
    'BP elevated. Recent HbA1c 8.2% (above target). Active conditions include T2DM `Condition/cond-dm2`, hypertension.',
  assessment:
    '1. Type 2 diabetes mellitus, suboptimal control (HbA1c 8.2 vs target <7) `Condition/cond-dm2`. 2. Essential hypertension, not at goal.',
  plan:
    '1. Add SGLT2 inhibitor (consider empagliflozin 10mg). 2. Reinforce diet/exercise. 3. Repeat HbA1c in 3 months. 4. ACE inhibitor titration. 5. Annual diabetic eye and foot exams.',
});

describe('draftSoapNote', () => {
  const fhirClient = mockFHIRClient({
    Patient: mockPatient(),
    Condition: [mockCondition('Type 2 Diabetes', { id: 'cond-dm2' })],
    MedicationRequest: [],
    AllergyIntolerance: [],
    Observation: [],
    Immunization: [],
  });

  it('renders all four SOAP sections from a valid LLM JSON response', async () => {
    const out = await draftSoapNote(
      fhirClient,
      { patientId: 'test-patient-1', visitReason: '3-month diabetes follow-up' },
      { llmConfig: buildMockLLM(MOCK_SOAP) },
    );

    expect(out).toContain('# SOAP Note (draft)');
    expect(out).toContain('**Visit Reason:** 3-month diabetes follow-up');
    expect(out).toContain('## S — Subjective');
    expect(out).toContain('## O — Objective');
    expect(out).toContain('## A — Assessment');
    expect(out).toContain('## P — Plan');
    // Citations from the LLM are preserved verbatim.
    expect(out).toContain('`Condition/cond-dm2`');
    // Footer attribution.
    expect(out).toContain('nowbind/mock-gpt-4o');
  });

  it('returns a configuration error when no LLM is provided', async () => {
    const out = await draftSoapNote(
      fhirClient,
      { patientId: 'test-patient-1', visitReason: 'follow-up' },
      { llmConfig: null },
    );
    expect(out).toContain('LLM provider not configured');
  });

  it('returns an input error when visit reason is missing', async () => {
    const out = await draftSoapNote(
      fhirClient,
      { patientId: 'test-patient-1', visitReason: '   ' },
      { llmConfig: buildMockLLM(MOCK_SOAP) },
    );
    expect(out).toContain('Visit reason is required');
  });

  it('handles malformed LLM JSON gracefully', async () => {
    const out = await draftSoapNote(
      fhirClient,
      { patientId: 'test-patient-1', visitReason: 'follow-up' },
      { llmConfig: buildMockLLM('not json') },
    );
    expect(out).toContain('malformed JSON');
  });

  it('handles a partial LLM response (missing one section) gracefully', async () => {
    const partial = JSON.stringify({
      subjective: 'x',
      objective: 'y',
      assessment: 'z',
      // plan: missing
    });
    const out = await draftSoapNote(
      fhirClient,
      { patientId: 'test-patient-1', visitReason: 'follow-up' },
      { llmConfig: buildMockLLM(partial) },
    );
    expect(out).toContain('missing one or more required SOAP sections');
  });

  it('passes clinician notes through to the user prompt', async () => {
    const llm = buildMockLLM(MOCK_SOAP);
    const out = await draftSoapNote(
      fhirClient,
      {
        patientId: 'test-patient-1',
        visitReason: 'follow-up',
        clinicianNotes: 'Reports new-onset bilateral foot tingling',
      },
      { llmConfig: llm },
    );
    // The note rendered successfully (clinician notes don't appear in output
    // since they go into the prompt; verify via the LLM mock call shape).
    const createMock = (llm.client.chat.completions.create as unknown as ReturnType<typeof vi.fn>);
    const args = createMock.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    const userMsg = args.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Reports new-onset bilateral foot tingling');
    expect(out).toContain('# SOAP Note (draft)');
  });
});
