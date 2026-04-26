import { describe, it, expect } from 'vitest';
import { patientSummary } from '../src/tools/patient-summary.js';
import {
  mockFHIRClient,
  mockPatient,
  mockCondition,
  mockMedication,
  mockAllergy,
  mockObservation,
  mockImmunization,
} from './helpers/mock-fhir.js';

describe('patientSummary citations', () => {
  it('includes a backtick-wrapped FHIR ref on each emitted clinical line', async () => {
    const client = mockFHIRClient({
      Patient: mockPatient(),
      Condition: [
        mockCondition('Type 2 Diabetes', { id: 'cond-dm2', onsetDateTime: '2018-01-01' }),
      ],
      MedicationRequest: [
        mockMedication('Metformin', { id: 'med-metformin' }),
      ],
      AllergyIntolerance: [
        mockAllergy('Penicillin', 'high', { id: 'allergy-pcn' }),
      ],
      Observation: [
        mockObservation('2160-0', 1.2, 'mg/dL', new Date().toISOString().slice(0, 10), {
          id: 'obs-creat',
        }),
      ],
      Immunization: [
        mockImmunization('Influenza', '2024-10-01', { id: 'imm-flu' }),
      ],
    });

    const out = await patientSummary(client, { patientId: 'test-patient-1' });

    expect(out).toContain('`Condition/cond-dm2`');
    expect(out).toContain('`MedicationRequest/med-metformin`');
    expect(out).toContain('`AllergyIntolerance/allergy-pcn`');
    expect(out).toContain('`Observation/obs-creat`');
    expect(out).toContain('`Immunization/imm-flu`');
  });

  it('omits the citation cleanly when a resource has no id', async () => {
    const client = mockFHIRClient({
      Patient: mockPatient(),
      Condition: [
        mockCondition('Hypertension', { id: undefined, onsetDateTime: '2010-01-01' }),
      ],
      MedicationRequest: [],
      AllergyIntolerance: [],
      Observation: [],
      Immunization: [],
    });

    const out = await patientSummary(client, { patientId: 'test-patient-1' });

    expect(out).toContain('Hypertension');
    // No backtick-wrapped reference for the un-id'd condition
    expect(out).not.toMatch(/`Condition\/`/);
    // Trailing whitespace cleanup on the line
    const conditionLine = out.split('\n').find((l) => l.includes('Hypertension'));
    expect(conditionLine?.endsWith(' ')).toBe(false);
  });
});
