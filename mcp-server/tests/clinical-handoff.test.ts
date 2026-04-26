import { describe, it, expect, vi } from 'vitest';

// Stub the external drug-interaction lookups so tests don't hit the network.
vi.mock('../src/external/rxnorm.js', () => ({
  getRxCUI: vi.fn().mockResolvedValue(null),
  getMultiInteractions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/external/openfda.js', () => ({
  searchDrugLabel: vi.fn().mockResolvedValue(null),
  getDrugClass: vi.fn().mockResolvedValue(null),
}));

import { clinicalHandoff } from '../src/tools/clinical-handoff.js';
import {
  mockFHIRClient,
  mockPatient,
  mockCondition,
  mockMedication,
  mockAllergy,
  mockObservation,
  mockImmunization,
} from './helpers/mock-fhir.js';

describe('clinicalHandoff', () => {
  it('renders a handoff document with all expected sections', async () => {
    const client = mockFHIRClient({
      Patient: mockPatient({ id: 'p-1', birthDate: '1955-01-01', gender: 'female' }),
      Condition: [
        mockCondition('Atrial fibrillation', { id: 'c-afib', onsetDateTime: '2018-01-01' }),
        mockCondition('Type 2 diabetes', { id: 'c-dm', onsetDateTime: '2010-01-01' }),
        mockCondition('Hypertension', { id: 'c-htn', onsetDateTime: '2012-01-01' }),
      ],
      MedicationRequest: [
        mockMedication('Warfarin', { id: 'm-warf' }),
        mockMedication('Ibuprofen', { id: 'm-ibu' }),
      ],
      AllergyIntolerance: [mockAllergy('Penicillin', 'high', { id: 'a-pcn' })],
      Observation: [
        // Critical creatinine value to ensure the "Labs To Watch" path lights up.
        mockObservation('2160-0', 4.5, 'mg/dL', new Date().toISOString().slice(0, 10), {
          id: 'o-creat',
        }),
      ],
      Immunization: [mockImmunization('Influenza', '2024-10-01', { id: 'i-flu' })],
    });

    const out = await clinicalHandoff(client, { patientId: 'p-1' });

    expect(out).toContain('# Clinical Shift Handoff');
    expect(out).toContain('Patient/p-1');
    expect(out).toContain('Active Conditions');
    expect(out).toContain('Atrial fibrillation');
    expect(out).toContain('Current Medications');
    expect(out).toContain('Allergies');
    expect(out).toContain('Labs To Watch');
    expect(out).toContain('Action Items For The Receiving Provider');
    // AFib triggers CHA2DS2-VASc; HTN/DM trigger ASCVD
    expect(out).toContain('Applicable Risk Scores');
    // Citations from the underlying tools survive the orchestration.
    expect(out).toContain('`Condition/c-afib`');
    expect(out).toContain('`MedicationRequest/m-warf`');
  });

  it('skips risk scores when includeRiskScores is false', async () => {
    const client = mockFHIRClient({
      Patient: mockPatient(),
      Condition: [mockCondition('Atrial fibrillation', { id: 'c-afib' })],
      MedicationRequest: [],
      AllergyIntolerance: [],
      Observation: [],
      Immunization: [],
    });

    const out = await clinicalHandoff(client, {
      patientId: 'test-patient-1',
      includeRiskScores: false,
    });

    expect(out).not.toContain('Applicable Risk Scores');
  });

  it('handles a patient with no FHIR-recorded data', async () => {
    // Note: care-gap-identifier emits USPSTF screenings based on age/sex even
    // when no FHIR data is present (no record found = "Due now"), so the
    // handoff still flags gap-related action items. That's correct clinical
    // behavior — an empty record is itself a signal.
    const client = mockFHIRClient({
      Patient: mockPatient(),
      Condition: [],
      MedicationRequest: [],
      AllergyIntolerance: [],
      Observation: [],
      Immunization: [],
    });

    const out = await clinicalHandoff(client, { patientId: 'test-patient-1' });

    expect(out).toContain('# Clinical Shift Handoff');
    expect(out).toContain('No active conditions on record.');
    expect(out).toContain('No active medications on record.');
    expect(out).toContain('No known allergies on record.');
    expect(out).toContain('No abnormal labs');
    // No risk scores apply when there are no conditions.
    expect(out).not.toContain('Applicable Risk Scores');
    // The action-items block is always present.
    expect(out).toContain('Action Items For The Receiving Provider');
  });

  it('does not surface a "Normal Results" tail in the labs section', async () => {
    // Lab interpreter emits "## Normal Results" when applicable; the handoff
    // suppresses it because handoff is for what needs attention.
    const client = mockFHIRClient({
      Patient: mockPatient(),
      Condition: [],
      MedicationRequest: [],
      AllergyIntolerance: [],
      Observation: [
        mockObservation('2160-0', 0.9, 'mg/dL', new Date().toISOString().slice(0, 10), {
          id: 'o-creat-normal',
        }),
      ],
      Immunization: [],
    });

    const out = await clinicalHandoff(client, { patientId: 'test-patient-1' });

    expect(out).not.toContain('Normal Results');
  });
});
