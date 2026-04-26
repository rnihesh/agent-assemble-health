import { describe, it, expect, vi } from 'vitest';
import { differentialDiagnosis } from '../src/tools/differential-diagnosis.js';
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
            choices: [
              {
                message: { content: jsonContent },
              },
            ],
          })),
        },
      },
    } as never,
  };
}

const MOCK_DDX_JSON = JSON.stringify({
  reasoningSummary:
    "Patient is a 72yo F with long-standing T2DM, hypertension, hyperlipidemia, history of renal transplant, and obesity, presenting with progressive fatigue and edema. Volume overload from cardiorenal syndrome and hypothyroidism are leading.",
  candidates: [
    {
      diagnosis: 'Cardiorenal syndrome / decompensated heart failure',
      likelihood: 'High',
      supportingFindings: [
        'History of renal transplant `Condition/cond-renal-tx`',
        'Long-standing T2DM with proteinuria `Condition/cond-dm2`',
        'Edema and progressive fatigue (chief complaint)',
      ],
      contradictingFindings: [
        'No documented LV dysfunction in record',
      ],
      recommendedNextSteps: [
        'BNP / NT-proBNP',
        'Bedside echocardiogram',
        'Daily weights, strict I/O',
      ],
      icdOrSnomedCode: 'I50.9',
    },
    {
      diagnosis: 'Hypothyroidism',
      likelihood: 'Medium',
      supportingFindings: [
        'Constellation of fatigue, weight gain, and edema',
      ],
      contradictingFindings: [
        'No prior thyroid dysfunction documented',
      ],
      recommendedNextSteps: ['TSH, free T4'],
    },
    {
      diagnosis: 'Anemia of chronic kidney disease',
      likelihood: 'Medium',
      supportingFindings: ['History of renal transplant', 'Diabetic nephropathy'],
      contradictingFindings: [],
      recommendedNextSteps: ['CBC with differential', 'Iron studies, ferritin', 'Reticulocyte count'],
    },
  ],
});

describe('differentialDiagnosis', () => {
  const fhirClient = mockFHIRClient({
    Patient: mockPatient(),
    Condition: [
      mockCondition('Type 2 Diabetes', { id: 'cond-dm2', onsetDateTime: '2010-01-01' }),
    ],
    MedicationRequest: [],
    AllergyIntolerance: [],
    Observation: [],
    Immunization: [],
  });

  it('renders ranked candidates from a valid LLM JSON response', async () => {
    const result = await differentialDiagnosis(
      fhirClient,
      {
        patientId: 'test-patient-1',
        chiefComplaint: '72F progressive fatigue, edema, weight gain',
      },
      { llmConfig: buildMockLLM(MOCK_DDX_JSON) },
    );

    expect(result).toContain('# Differential Diagnosis');
    expect(result).toContain('72F progressive fatigue');
    expect(result).toContain('Cardiorenal syndrome');
    expect(result).toContain('Hypothyroidism');
    expect(result).toContain('Anemia of chronic kidney disease');
    expect(result).toContain('High likelihood');
    expect(result).toContain('Medium likelihood');
    // Citations from the LLM are preserved verbatim.
    expect(result).toContain('`Condition/cond-renal-tx`');
    expect(result).toContain('`Condition/cond-dm2`');
    // Footer attribution.
    expect(result).toContain('nowbind/mock-gpt-4o');
  });

  it('returns a configuration error when no LLM is provided', async () => {
    const result = await differentialDiagnosis(
      fhirClient,
      {
        patientId: 'test-patient-1',
        chiefComplaint: 'fatigue',
      },
      { llmConfig: null },
    );

    expect(result).toContain('LLM provider not configured');
    expect(result).toContain('NOWBIND_AGENT_OPENAI_API_KEY');
  });

  it('returns an input error when chief complaint is missing', async () => {
    const result = await differentialDiagnosis(
      fhirClient,
      {
        patientId: 'test-patient-1',
        chiefComplaint: '   ',
      },
      { llmConfig: buildMockLLM(MOCK_DDX_JSON) },
    );

    expect(result).toContain('Chief complaint is required');
  });

  it('handles malformed LLM JSON gracefully', async () => {
    const result = await differentialDiagnosis(
      fhirClient,
      {
        patientId: 'test-patient-1',
        chiefComplaint: 'fatigue',
      },
      { llmConfig: buildMockLLM('this is not json') },
    );

    expect(result).toContain('LLM returned malformed JSON');
    expect(result).toContain('this is not json');
  });

  it('handles empty candidates array gracefully', async () => {
    const result = await differentialDiagnosis(
      fhirClient,
      {
        patientId: 'test-patient-1',
        chiefComplaint: 'fatigue',
      },
      { llmConfig: buildMockLLM(JSON.stringify({ candidates: [] })) },
    );

    expect(result).toContain('did not return any differential candidates');
  });

  it('renders additional context when provided', async () => {
    const result = await differentialDiagnosis(
      fhirClient,
      {
        patientId: 'test-patient-1',
        chiefComplaint: 'fatigue',
        additionalContext: 'Recent travel to malaria-endemic region',
      },
      { llmConfig: buildMockLLM(MOCK_DDX_JSON) },
    );

    expect(result).toContain('Additional Context:');
    expect(result).toContain('Recent travel to malaria-endemic region');
  });
});
