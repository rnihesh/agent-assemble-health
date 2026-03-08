/**
 * Mock FHIR resource factories for unit tests.
 */
import type {
  Patient,
  Condition,
  Observation,
  MedicationRequest,
  AllergyIntolerance,
  Immunization,
  Procedure,
  Bundle,
} from '../../src/fhir/types.js';
import type { FHIRClient } from '../../src/fhir/client.js';

// ── Patient ───────────────────────────────────────────────────────────────────

export function mockPatient(overrides?: Partial<Patient>): Patient {
  return {
    resourceType: 'Patient',
    id: 'test-patient-1',
    name: [
      {
        given: ['John'],
        family: 'Doe',
      },
    ],
    gender: 'male',
    birthDate: '1960-05-15',
    ...overrides,
  };
}

// ── Condition ─────────────────────────────────────────────────────────────────

export function mockCondition(
  display: string,
  overrides?: Partial<Condition>,
): Condition {
  return {
    resourceType: 'Condition',
    id: `condition-${display.replace(/\s+/g, '-').toLowerCase()}`,
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '123456',
          display,
        },
      ],
      text: display,
    },
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
    },
    ...overrides,
  };
}

// ── Observation ───────────────────────────────────────────────────────────────

export function mockObservation(
  loincCode: string,
  value: number,
  unit: string,
  date?: string,
  overrides?: Partial<Observation>,
): Observation {
  return {
    resourceType: 'Observation',
    id: `obs-${loincCode}-${value}`,
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: loincCode,
          display: `Test ${loincCode}`,
        },
      ],
    },
    valueQuantity: {
      value,
      unit,
    },
    effectiveDateTime: date ?? '2025-01-15',
    ...overrides,
  };
}

// ── MedicationRequest ─────────────────────────────────────────────────────────

export function mockMedication(
  name: string,
  overrides?: Partial<MedicationRequest>,
): MedicationRequest {
  return {
    resourceType: 'MedicationRequest',
    id: `med-${name.replace(/\s+/g, '-').toLowerCase()}`,
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [{ display: name }],
      text: name,
    },
    ...overrides,
  };
}

// ── AllergyIntolerance ────────────────────────────────────────────────────────

export function mockAllergy(
  name: string,
  criticality?: string,
  overrides?: Partial<AllergyIntolerance>,
): AllergyIntolerance {
  return {
    resourceType: 'AllergyIntolerance',
    id: `allergy-${name.replace(/\s+/g, '-').toLowerCase()}`,
    clinicalStatus: {
      coding: [{ code: 'active' }],
    },
    code: {
      coding: [{ display: name }],
      text: name,
    },
    criticality: criticality ?? 'high',
    ...overrides,
  };
}

// ── Immunization ──────────────────────────────────────────────────────────────

export function mockImmunization(
  name: string,
  date?: string,
  overrides?: Partial<Immunization>,
): Immunization {
  return {
    resourceType: 'Immunization',
    id: `imm-${name.replace(/\s+/g, '-').toLowerCase()}`,
    status: 'completed',
    vaccineCode: {
      coding: [{ display: name }],
      text: name,
    },
    occurrenceDateTime: date ?? '2024-01-01',
    ...overrides,
  };
}

// ── Procedure ─────────────────────────────────────────────────────────────────

export function mockProcedure(
  name: string,
  date?: string,
  overrides?: Partial<Procedure>,
): Procedure {
  return {
    resourceType: 'Procedure',
    id: `proc-${name.replace(/\s+/g, '-').toLowerCase()}`,
    status: 'completed',
    code: {
      coding: [{ display: name }],
      text: name,
    },
    performedDateTime: date ?? '2024-01-01',
    ...overrides,
  };
}

// ── Blood Pressure Observation ────────────────────────────────────────────────

export function mockBloodPressure(
  systolic: number,
  diastolic: number,
  date?: string,
): Observation {
  return {
    resourceType: 'Observation',
    id: `obs-bp-${systolic}-${diastolic}`,
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '85354-9',
          display: 'Blood Pressure',
        },
      ],
    },
    component: [
      {
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8480-6',
              display: 'Systolic Blood Pressure',
            },
          ],
        },
        valueQuantity: { value: systolic, unit: 'mmHg' },
      },
      {
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '8462-4',
              display: 'Diastolic Blood Pressure',
            },
          ],
        },
        valueQuantity: { value: diastolic, unit: 'mmHg' },
      },
    ],
    effectiveDateTime: date ?? '2025-01-15',
  };
}

// ── Heart Rate Observation ────────────────────────────────────────────────────

export function mockHeartRate(value: number, date?: string): Observation {
  return {
    resourceType: 'Observation',
    id: `obs-hr-${value}`,
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '8867-4',
          display: 'Heart Rate',
        },
      ],
    },
    valueQuantity: { value, unit: 'bpm' },
    effectiveDateTime: date ?? '2025-01-15',
  };
}

// ── Mock FHIRClient ───────────────────────────────────────────────────────────

/**
 * Create a mock FHIRClient with pre-configured responses.
 * Keys in `responses` should be resource types (e.g. "Patient", "Condition").
 * - `read` calls return the value directly.
 * - `searchAll`/`searchEntries` calls return the value as an array.
 */
export function mockFHIRClient(responses: Record<string, unknown>): FHIRClient {
  const client = {
    read: vi.fn(async (resourceType: string, _id: string) => {
      return responses[resourceType] ?? {};
    }),
    search: vi.fn(async (resourceType: string, _params: Record<string, string>) => {
      const data = responses[resourceType];
      if (Array.isArray(data)) {
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: data.map((r: unknown) => ({ resource: r })),
        } as Bundle;
      }
      return data ?? { resourceType: 'Bundle', type: 'searchset', entry: [] };
    }),
    searchEntries: vi.fn(async (resourceType: string, _params: Record<string, string>) => {
      const data = responses[resourceType];
      return Array.isArray(data) ? data : [];
    }),
    searchAll: vi.fn(async (resourceType: string, _params: Record<string, string>) => {
      const data = responses[resourceType];
      return Array.isArray(data) ? data : [];
    }),
  } as unknown as FHIRClient;

  return client;
}
