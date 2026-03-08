import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchClinicalGuidelines } from '../src/tools/guideline-matcher.js';
import {
  mockPatient,
  mockCondition,
  mockObservation,
  mockMedication,
  mockFHIRClient,
  mockBloodPressure,
} from './helpers/mock-fhir.js';

vi.mock('../src/fhir/queries/patient.js', () => ({
  getPatient: vi.fn(),
}));
vi.mock('../src/fhir/queries/conditions.js', () => ({
  getConditions: vi.fn(),
}));
vi.mock('../src/fhir/queries/medications.js', () => ({
  getActiveMedications: vi.fn(),
}));
vi.mock('../src/fhir/queries/observations.js', () => ({
  getRecentLabs: vi.fn(),
  getRecentVitals: vi.fn(),
}));

import { getPatient } from '../src/fhir/queries/patient.js';
import { getConditions } from '../src/fhir/queries/conditions.js';
import { getActiveMedications } from '../src/fhir/queries/medications.js';
import { getRecentLabs, getRecentVitals } from '../src/fhir/queries/observations.js';

const mockedGetPatient = vi.mocked(getPatient);
const mockedGetConditions = vi.mocked(getConditions);
const mockedGetActiveMedications = vi.mocked(getActiveMedications);
const mockedGetRecentLabs = vi.mocked(getRecentLabs);
const mockedGetRecentVitals = vi.mocked(getRecentVitals);

beforeEach(() => {
  vi.clearAllMocks();
});

function setupMocks(overrides?: {
  patient?: ReturnType<typeof mockPatient>;
  conditions?: ReturnType<typeof mockCondition>[];
  medications?: ReturnType<typeof mockMedication>[];
  labs?: ReturnType<typeof mockObservation>[];
  vitals?: ReturnType<typeof mockObservation>[];
}) {
  const patient = overrides?.patient ?? mockPatient({ birthDate: '1960-01-01', gender: 'male' });
  mockedGetPatient.mockResolvedValue(patient);
  mockedGetConditions.mockResolvedValue(overrides?.conditions ?? []);
  mockedGetActiveMedications.mockResolvedValue(overrides?.medications ?? []);
  mockedGetRecentLabs.mockResolvedValue(overrides?.labs ?? []);
  mockedGetRecentVitals.mockResolvedValue(overrides?.vitals ?? []);
}

// ══════════════════════════════════════════════════════════════════════════════
// Matching diabetes to ADA guidelines
// ══════════════════════════════════════════════════════════════════════════════

describe('matchClinicalGuidelines - diabetes', () => {
  it('matches diabetes patient to ADA guidelines', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('Type 2 Diabetes');
    expect(result).toContain('ADA');
    expect(result).toContain('Treatment Targets');
    expect(result).toContain('HbA1c');
  });

  it('assesses HbA1c target when lab is available', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
      labs: [
        mockObservation('4548-4', 6.5, '%', '2025-01-15'), // HbA1c at target (<7.0%)
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('At target');
  });

  it('flags HbA1c not at target', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
      labs: [
        mockObservation('4548-4', 8.5, '%', '2025-01-15'), // HbA1c NOT at target
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('Not at target');
    expect(result).toContain('Action Items');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Matching hypertension to ACC/AHA guidelines
// ══════════════════════════════════════════════════════════════════════════════

describe('matchClinicalGuidelines - hypertension', () => {
  it('matches hypertension patient to ACC/AHA guidelines', async () => {
    setupMocks({
      conditions: [
        mockCondition('Essential Hypertension'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('Hypertension');
    expect(result).toContain('ACC/AHA');
    expect(result).toContain('Systolic');
    expect(result).toContain('Diastolic');
  });

  it('assesses blood pressure target', async () => {
    setupMocks({
      conditions: [
        mockCondition('Essential Hypertension'),
      ],
      vitals: [
        mockBloodPressure(125, 75, '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    // BP 125/75 is at target (<130/80)
    expect(result).toContain('At target');
  });

  it('flags blood pressure not at target', async () => {
    setupMocks({
      conditions: [
        mockCondition('Essential Hypertension'),
      ],
      vitals: [
        mockBloodPressure(145, 92, '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('Not at target');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Medication assessment
// ══════════════════════════════════════════════════════════════════════════════

describe('matchClinicalGuidelines - medication assessment', () => {
  it('recognizes prescribed guideline-recommended medication', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
      medications: [
        mockMedication('Metformin 500mg'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('Medication Assessment');
    expect(result).toContain('YES');
    expect(result).toContain('Metformin');
  });

  it('flags missing recommended medications', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
      medications: [], // No medications prescribed
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('No');
    expect(result).toContain('Action Items');
    expect(result).toContain('guideline-recommended therapy');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Action item generation
// ══════════════════════════════════════════════════════════════════════════════

describe('matchClinicalGuidelines - action items', () => {
  it('generates action items for targets not at goal', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
      labs: [
        mockObservation('4548-4', 9.0, '%', '2025-01-15'), // Very high HbA1c
      ],
      medications: [],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('Action Items');
    expect(result).toContain('Address');
    expect(result).toContain('HbA1c');
  });

  it('generates action items for missing lab data', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
      labs: [], // No labs at all
      medications: [],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('Action Items');
    expect(result).toContain('Order');
    expect(result).toContain('testing');
  });

  it('reports all targets met when compliant', async () => {
    setupMocks({
      conditions: [
        mockCondition('Type 2 Diabetes Mellitus'),
      ],
      labs: [
        mockObservation('4548-4', 6.0, '%', '2025-01-15'),   // HbA1c at target
        mockObservation('2345-7', 90, 'mg/dL', '2025-01-15'), // Fasting glucose at target
        mockObservation('2089-1', 85, 'mg/dL', '2025-01-15'), // LDL at target
      ],
      medications: [
        mockMedication('Metformin 1000mg'),
      ],
      vitals: [
        mockBloodPressure(125, 78, '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('At target');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Condition search by string
// ══════════════════════════════════════════════════════════════════════════════

describe('matchClinicalGuidelines - condition search', () => {
  it('matches guidelines by condition string without patient data', async () => {
    const result = await matchClinicalGuidelines(null, {
      condition: 'diabetes',
    });

    expect(result).toContain('Type 2 Diabetes');
    expect(result).toContain('ADA');
  });

  it('matches hypertension by condition string', async () => {
    const result = await matchClinicalGuidelines(null, {
      condition: 'hypertension',
    });

    expect(result).toContain('Hypertension');
    expect(result).toContain('ACC/AHA');
  });

  it('returns no match for unknown condition', async () => {
    const result = await matchClinicalGuidelines(null, {
      condition: 'xyznonexistent',
    });

    expect(result).toContain('No matching clinical guidelines');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// No matching guidelines
// ══════════════════════════════════════════════════════════════════════════════

describe('matchClinicalGuidelines - no matches', () => {
  it('reports no matches when patient has no guideline-covered conditions', async () => {
    setupMocks({
      conditions: [
        mockCondition('Common cold'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await matchClinicalGuidelines(client, {
      patientId: 'p1',
    });

    expect(result).toContain('No matching clinical guidelines');
    expect(result).toContain('Available guidelines');
  });

  it('reports no matches with empty inputs', async () => {
    const result = await matchClinicalGuidelines(null, {});

    expect(result).toContain('No matching clinical guidelines');
  });
});
